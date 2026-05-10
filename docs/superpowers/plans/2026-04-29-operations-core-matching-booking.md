# Operations Core Matching And Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real operating workflow after company activation: ranked matching, direct room booking confirmation, ChatBB human-approved actions, and confirmed load creation.

**Architecture:** Keep the backend as the source of truth for match snapshots and booking state. The frontend should render match rankings and booking controls from API data instead of local-only preview state. ChatBB may draft and recommend actions, but any action that creates a room, sends a bid/message, confirms a booking, or creates a load must require an explicit user click.

**Tech Stack:** NestJS, Mongoose, Jest, Angular 16, RxJS, local MongoDB demo seed, existing Prometheus backend/frontend services.

---

## Current Baseline

- The approved spec is `docs/superpowers/specs/2026-04-29-operations-core-matching-booking-design.md`.
- Backend `MatchingService` already ranks candidates and stores `matchsnapshots`, but no controller exposes it to the app.
- Frontend matching currently calls `PostsApiService.searchCarrierPosts` or `PostsApiService.searchBrokerPosts` directly from `WorkspaceComponent.loadMatchCandidates`.
- Direct rooms exist through `MessagesService`, but rooms do not persist booking lifecycle state.
- `LoadsService.createFromRoom` creates loads from any existing room. The milestone requires it to create loads only after a room is confirmed as booked.
- The app already has a local booking assistant surface in `WorkspaceComponent`, but its booking approval state is mostly local UI state and should become API-backed.

## File Structure And Responsibilities

### Backend Files

- Create `prometheus-backend/src/matching/dto/matching.dto.ts`
  - Request DTOs for creating and fetching snapshots.
- Create `prometheus-backend/src/matching/matching.controller.ts`
  - Authenticated `POST /matching/snapshots` and `GET /matching/snapshots/latest/:sourcePostType/:sourcePostId` endpoints used by the workspace matching console.
- Create `prometheus-backend/src/matching/matching.controller.spec.ts`
  - Controller role and service-call tests.
- Modify `prometheus-backend/src/matching/matching.module.ts`
  - Register `MatchingController`.
- Create `prometheus-backend/src/messages/dto/update-booking-status.dto.ts`
  - DTO for room booking status updates.
- Modify `prometheus-backend/src/messages/interface/messages.interface.ts`
  - Add persistent booking status fields.
- Modify `prometheus-backend/src/messages/schema/messages.schema.ts`
  - Persist room booking state with defaults and indexes.
- Modify `prometheus-backend/src/messages/messages.service.ts`
  - Add idempotent `createRoom` return shape, `updateBookingStatus`, and `findRoomByPair`.
- Modify `prometheus-backend/src/messages/messages.controller.ts`
  - Add `PATCH /messages/room/booking`.
- Create `prometheus-backend/src/messages/messages.service.spec.ts`
  - Booking lifecycle service tests.
- Modify `prometheus-backend/src/loads/loads.service.ts`
  - Reject load creation unless the room booking status is `booked`.
- Create `prometheus-backend/src/loads/loads.service.spec.ts`
  - Confirmed-room guard tests.
- Modify `prometheus-backend/scripts/seed-local-demo.js`
  - Seed booking status on demo rooms.

### Frontend Files

- Modify `prometheus/src/app/shared/types/models.ts`
  - Add match snapshot and booking lifecycle types.
- Create `prometheus/src/app/core/api/matching-api.service.ts`
  - Angular API wrapper for backend matching.
- Modify `prometheus/src/app/core/api/messages-api.service.ts`
  - Return room state from `createRoom`; add `updateBookingStatus`.
- Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`
  - Accept match snapshot/candidates and emit selected candidate actions.
- Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
  - Show ranked candidate cards with score reasons and action buttons.
- Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss`
  - Add compact operational styles for ranked candidates.
- Modify `prometheus/src/app/features/workspace/workspace.component.ts`
  - Wire backend match snapshots, booking status updates, load creation guard messaging, and ChatBB action approval buttons.
- Modify `prometheus/src/app/features/workspace/workspace.component.html`
  - Show room booking state and action controls in Direct/Booking views where the current template already renders direct-room actions.

## Helper Agent Boundaries

Use helpers only for bounded work with disjoint write scopes:

- Helper A: backend matching API.
  - Owns only `prometheus-backend/src/matching/**`.
- Helper B: backend room booking lifecycle and load guard.
  - Owns only `prometheus-backend/src/messages/**`, `prometheus-backend/src/loads/**`, and `prometheus-backend/scripts/seed-local-demo.js`.
- Helper C: frontend API/types and matching card component.
  - Owns only `prometheus/src/app/shared/types/models.ts`, `prometheus/src/app/core/api/matching-api.service.ts`, `prometheus/src/app/core/api/messages-api.service.ts`, and `prometheus/src/app/features/workspace/ai-matching-console/**`.
- Lead agent:
  - Owns `prometheus/src/app/features/workspace/workspace.component.ts`, `prometheus/src/app/features/workspace/workspace.component.html`, final integration, final verification, and commits.

Helpers must not merge, commit to `main`, change `.env`, edit Stripe/DigitalOcean files, or alter unrelated onboarding/setup code. Helpers should state changed file paths in their final response.

---

### Task 1: Backend Matching API

**Files:**
- Create: `prometheus-backend/src/matching/dto/matching.dto.ts`
- Create: `prometheus-backend/src/matching/matching.controller.ts`
- Create: `prometheus-backend/src/matching/matching.controller.spec.ts`
- Modify: `prometheus-backend/src/matching/matching.module.ts`

- [ ] **Step 1: Write the failing controller test**

Create `prometheus-backend/src/matching/matching.controller.spec.ts`:

```ts
import { BadRequestException } from "@nestjs/common";
import { MatchingController } from "./matching.controller";

describe("MatchingController", () => {
  const service: any = {
    createSnapshotForBrokerPost: jest.fn(),
    createSnapshotForCarrierPost: jest.fn(),
    getLatestSnapshot: jest.fn(),
  };

  function controller() {
    return new MatchingController(service);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a broker-post snapshot for the signed-in user", async () => {
    service.createSnapshotForBrokerPost.mockResolvedValue({ sourcePostId: "broker-1", candidateCount: 2 });

    const result = await controller().createSnapshot(
      { sourcePostType: "brokerPost", sourcePostId: "broker-1" },
      { user: { _id: "user-1" } }
    );

    expect(service.createSnapshotForBrokerPost).toHaveBeenCalledWith("broker-1", "user-1");
    expect(result).toEqual({ sourcePostId: "broker-1", candidateCount: 2 });
  });

  it("creates a carrier-post snapshot for the signed-in user", async () => {
    service.createSnapshotForCarrierPost.mockResolvedValue({ sourcePostId: "carrier-1", candidateCount: 3 });

    const result = await controller().createSnapshot(
      { sourcePostType: "carrierPost", sourcePostId: "carrier-1" },
      { user: { _id: "user-2" } }
    );

    expect(service.createSnapshotForCarrierPost).toHaveBeenCalledWith("carrier-1", "user-2");
    expect(result).toEqual({ sourcePostId: "carrier-1", candidateCount: 3 });
  });

  it("rejects an unknown source post type", async () => {
    await expect(
      controller().createSnapshot(
        { sourcePostType: "unknown" as any, sourcePostId: "post-1" },
        { user: { _id: "user-1" } }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("gets the latest snapshot by source type and post id", async () => {
    service.getLatestSnapshot.mockResolvedValue({ sourcePostId: "broker-1", candidateCount: 1 });

    const result = await controller().getLatest("brokerPost", "broker-1");

    expect(service.getLatestSnapshot).toHaveBeenCalledWith("brokerPost", "broker-1");
    expect(result).toEqual({ sourcePostId: "broker-1", candidateCount: 1 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because the controller does not exist**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/matching/matching.controller.spec.ts --runInBand
```

Expected: FAIL with a TypeScript module error for `./matching.controller`.

- [ ] **Step 3: Create the matching DTO**

Create `prometheus-backend/src/matching/dto/matching.dto.ts`:

```ts
import { IsIn, IsString } from "class-validator";
import { MatchSourcePostType } from "../interface/match-snapshot.interface";

export class CreateMatchSnapshotDTO {
  @IsIn(["carrierPost", "brokerPost"])
  readonly sourcePostType: MatchSourcePostType;

  @IsString()
  readonly sourcePostId: string;
}
```

- [ ] **Step 4: Create the matching controller**

Create `prometheus-backend/src/matching/matching.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { CreateMatchSnapshotDTO } from "./dto/matching.dto";
import { MatchSourcePostType } from "./interface/match-snapshot.interface";
import { MatchingService } from "./matching.service";

@ApiTags("matching")
@Controller("matching")
export class MatchingController {
  constructor(private readonly service: MatchingService) {}

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Post("snapshots")
  @ApiOkResponse({ status: 200 })
  async createSnapshot(@Body() data: CreateMatchSnapshotDTO, @Req() req) {
    if (data.sourcePostType === "brokerPost") {
      return this.service.createSnapshotForBrokerPost(data.sourcePostId, String(req.user._id));
    }
    if (data.sourcePostType === "carrierPost") {
      return this.service.createSnapshotForCarrierPost(data.sourcePostId, String(req.user._id));
    }
    throw new BadRequestException("Unknown match source post type.");
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get("snapshots/latest/:sourcePostType/:sourcePostId")
  @ApiOkResponse({ status: 200 })
  getLatest(@Param("sourcePostType") sourcePostType: MatchSourcePostType, @Param("sourcePostId") sourcePostId: string) {
    return this.service.getLatestSnapshot(sourcePostType, sourcePostId);
  }
}
```

- [ ] **Step 5: Register the controller**

Modify `prometheus-backend/src/matching/matching.module.ts` so the metadata includes the controller:

```ts
import { MatchingController } from "./matching.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "matchSnapshot", schema: MatchSnapshotSchema },
      { name: "brokerPost", schema: PostBrokerSchema },
      { name: "carrierPost", schema: PostCarrierSchema },
    ]),
    RoutingModule,
    PostBrokerModule,
    PostCarrierModule,
  ],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
```

- [ ] **Step 6: Verify the matching API test passes**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/matching/matching.controller.spec.ts --runInBand
```

Expected: PASS with 4 tests.

- [ ] **Step 7: Commit Task 1**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/matching/dto/matching.dto.ts src/matching/matching.controller.ts src/matching/matching.controller.spec.ts src/matching/matching.module.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: expose matching snapshots"
```

---

### Task 2: Backend Booking Lifecycle

**Files:**
- Create: `prometheus-backend/src/messages/dto/update-booking-status.dto.ts`
- Create: `prometheus-backend/src/messages/messages.service.spec.ts`
- Modify: `prometheus-backend/src/messages/interface/messages.interface.ts`
- Modify: `prometheus-backend/src/messages/schema/messages.schema.ts`
- Modify: `prometheus-backend/src/messages/messages.service.ts`
- Modify: `prometheus-backend/src/messages/messages.controller.ts`

- [ ] **Step 1: Write the failing service tests**

Create `prometheus-backend/src/messages/messages.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MessagesService } from "./messages.service";

describe("MessagesService booking lifecycle", () => {
  const companyModel: any = {};
  const userModel: any = {
    updateMany: jest.fn(),
  };
  const messagesModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  };
  const gateway: any = {
    broadcast: jest.fn(),
  };

  function service() {
    return new MessagesService(companyModel, userModel, messagesModel, gateway);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a room with negotiating booking state and returns the room", async () => {
    messagesModel.find.mockResolvedValue([]);
    messagesModel.create.mockResolvedValue({
      _id: "room-1",
      carrierPostId: "carrier-post-1",
      brokerPostId: "broker-post-1",
      brokerId: "broker-user-1",
      carrierId: "carrier-user-1",
      bookingStatus: "negotiating",
      brokerApprovedBooking: false,
      carrierApprovedBooking: false,
      toObject: () => ({
        _id: "room-1",
        bookingStatus: "negotiating",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      }),
    });

    const result = await service().createRoom(
      { myPostId: "broker-post-1", otherPostId: "carrier-post-1", otherUserId: "carrier-user-1" },
      "broker-user-1",
      "broker"
    );

    expect(messagesModel.create).toHaveBeenCalledWith(expect.objectContaining({
      carrierPostId: "carrier-post-1",
      brokerPostId: "broker-post-1",
      bookingStatus: "negotiating",
      brokerApprovedBooking: false,
      carrierApprovedBooking: false,
    }));
    expect(result.created).toBe(true);
    expect(result.room.bookingStatus).toBe("negotiating");
  });

  it("returns the existing room instead of false when the room already exists", async () => {
    messagesModel.find.mockResolvedValue([{ _id: "room-1", bookingStatus: "negotiating" }]);

    const result = await service().createRoom(
      { myPostId: "broker-post-1", otherPostId: "carrier-post-1", otherUserId: "carrier-user-1" },
      "broker-user-1",
      "broker"
    );

    expect(result.created).toBe(false);
    expect(result.room._id).toBe("room-1");
  });

  it("marks broker approval without booking the room until carrier also approves", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      }),
    });
    messagesModel.findOneAndUpdate.mockResolvedValue({
      toObject: () => ({
        bookingStatus: "negotiating",
        brokerApprovedBooking: true,
        carrierApprovedBooking: false,
      }),
    });

    const result = await service().updateBookingStatus(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1", action: "approve" },
      { _id: "broker-user-1", role: "broker" }
    );

    expect(messagesModel.findOneAndUpdate).toHaveBeenCalledWith(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      expect.objectContaining({
        brokerApprovedBooking: true,
        bookingStatus: "negotiating",
      }),
      { new: true }
    );
    expect(result.bookingStatus).toBe("negotiating");
  });

  it("books the room when the second side approves", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
        brokerApprovedBooking: true,
        carrierApprovedBooking: false,
      }),
    });
    messagesModel.findOneAndUpdate.mockResolvedValue({
      toObject: () => ({
        bookingStatus: "booked",
        brokerApprovedBooking: true,
        carrierApprovedBooking: true,
      }),
    });

    const result = await service().updateBookingStatus(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1", action: "approve" },
      { _id: "carrier-user-1", role: "carrier" }
    );

    expect(messagesModel.findOneAndUpdate).toHaveBeenCalledWith(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      expect.objectContaining({
        carrierApprovedBooking: true,
        bookingStatus: "booked",
        bookingConfirmedAt: expect.any(Date),
        bookingConfirmedBy: "carrier-user-1",
      }),
      { new: true }
    );
    expect(result.bookingStatus).toBe("booked");
  });

  it("rejects approval from a user who is not part of the room", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
      }),
    });

    await expect(
      service().updateBookingStatus(
        { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1", action: "approve" },
        { _id: "wrong-user", role: "broker" }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("cancels booking approval state", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
        brokerApprovedBooking: true,
        carrierApprovedBooking: true,
      }),
    });
    messagesModel.findOneAndUpdate.mockResolvedValue({
      toObject: () => ({
        bookingStatus: "cancelled",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      }),
    });

    const result = await service().updateBookingStatus(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1", action: "cancel" },
      { _id: "broker-user-1", role: "broker" }
    );

    expect(result.bookingStatus).toBe("cancelled");
  });

  it("rejects an unsupported booking action", async () => {
    await expect(
      service().updateBookingStatus(
        { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1", action: "something" as any },
        { _id: "broker-user-1", role: "broker" }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws not found when the room does not exist", async () => {
    messagesModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await expect(
      service().findRoomByPair("broker-post-1", "carrier-post-1")
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the booking test and confirm it fails**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/messages/messages.service.spec.ts --runInBand
```

Expected: FAIL because `updateBookingStatus` and `findRoomByPair` do not exist and `createRoom` still returns boolean values.

- [ ] **Step 3: Add the booking DTO**

Create `prometheus-backend/src/messages/dto/update-booking-status.dto.ts`:

```ts
import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateBookingStatusDTO {
  @IsString()
  readonly brokerPostId: string;

  @IsString()
  readonly carrierPostId: string;

  @IsIn(["approve", "cancel"])
  readonly action: "approve" | "cancel";

  @IsOptional()
  @IsString()
  readonly note?: string;
}
```

- [ ] **Step 4: Extend the message interface**

Modify `prometheus-backend/src/messages/interface/messages.interface.ts`:

```ts
import { Document } from "mongoose";

export type MessageBookingStatus = "negotiating" | "booked" | "cancelled" | "delivered";

export interface Messages extends Document {
  carrierPostId: string;
  brokerPostId: string;
  brokerId: string;
  hiddenForBroker: boolean;
  hiddenForCarrier: boolean;
  carrierId: string;
  createdBy: string;
  messages: Array<Object>;
  seen: { brokerCount: Number; carrierCount: Number };
  bookingStatus: MessageBookingStatus;
  brokerApprovedBooking: boolean;
  carrierApprovedBooking: boolean;
  bookingConfirmedAt?: Date;
  bookingConfirmedBy?: string;
  bookingRate?: number;
  bookingNotes?: string;
  loadId?: string;
  bookingCancelledAt?: Date;
  bookingStatusUpdatedAt?: Date;
  bookingStatusUpdatedBy?: string;
}
```

- [ ] **Step 5: Extend the message schema**

Modify `prometheus-backend/src/messages/schema/messages.schema.ts`:

```ts
import * as mongoose from "mongoose";
import { Messages } from "../interface/messages.interface";

export const MessagesSchema = new mongoose.Schema<Messages>(
  {
    carrierPostId: { type: String, index: true },
    brokerPostId: { type: String, index: true },
    brokerId: String,
    carrierId: String,
    hiddenForBroker: Boolean,
    hiddenForCarrier: Boolean,
    messages: Array,
    createdBy: String,
    seen: { brokerCount: Number, carrierCount: Number },
    bookingStatus: {
      type: String,
      enum: ["negotiating", "booked", "cancelled", "delivered"],
      default: "negotiating",
      index: true,
    },
    brokerApprovedBooking: { type: Boolean, default: false },
    carrierApprovedBooking: { type: Boolean, default: false },
    bookingConfirmedAt: Date,
    bookingConfirmedBy: String,
    bookingRate: Number,
    bookingNotes: String,
    loadId: String,
    bookingCancelledAt: Date,
    bookingStatusUpdatedAt: Date,
    bookingStatusUpdatedBy: String,
  },
  {
    timestamps: true,
    collection: "messages",
  }
);

MessagesSchema.index({ brokerPostId: 1, carrierPostId: 1 }, { unique: true });
```

- [ ] **Step 6: Update the message service**

Modify `prometheus-backend/src/messages/messages.service.ts` imports:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UpdateBookingStatusDTO } from "./dto/update-booking-status.dto";
```

Add these methods inside `MessagesService`:

```ts
async findRoomByPair(brokerPostId: string, carrierPostId: string) {
  const room = await this.messagesModel.findOne({ brokerPostId, carrierPostId }).lean<any>();
  if (!room) {
    throw new NotFoundException("Direct room was not found.");
  }
  return room;
}

async updateBookingStatus(data: UpdateBookingStatusDTO, user: any) {
  if (!["approve", "cancel"].includes(data.action)) {
    throw new BadRequestException("Unsupported booking action.");
  }

  const room = await this.findRoomByPair(data.brokerPostId, data.carrierPostId);
  const userId = String(user._id ?? "");
  const role = String(user.role ?? "");
  const isBrokerSide = role === "broker" && String(room.brokerId) === userId;
  const isCarrierSide = role === "carrier" && String(room.carrierId) === userId;
  const isManagerSide = ["admin", "manager", "supervisor"].includes(role);

  if (!isBrokerSide && !isCarrierSide && !isManagerSide) {
    throw new ForbiddenException("Only room participants can update booking status.");
  }

  const now = new Date();
  const update: any = {
    bookingStatusUpdatedAt: now,
    bookingStatusUpdatedBy: userId,
    bookingNotes: String(data.note ?? "").trim(),
  };

  if (data.action === "cancel") {
    update.bookingStatus = "cancelled";
    update.brokerApprovedBooking = false;
    update.carrierApprovedBooking = false;
    update.bookingCancelledAt = now;
    update.bookingConfirmedAt = null;
    update.bookingConfirmedBy = null;
    return this.messagesModel.findOneAndUpdate(
      { brokerPostId: data.brokerPostId, carrierPostId: data.carrierPostId },
      update,
      { new: true }
    );
  }

  const brokerApprovedBooking = isBrokerSide || isManagerSide ? true : Boolean(room.brokerApprovedBooking);
  const carrierApprovedBooking = isCarrierSide || isManagerSide ? true : Boolean(room.carrierApprovedBooking);
  update.brokerApprovedBooking = brokerApprovedBooking;
  update.carrierApprovedBooking = carrierApprovedBooking;

  if (brokerApprovedBooking && carrierApprovedBooking) {
    update.bookingStatus = "booked";
    update.bookingConfirmedAt = room.bookingConfirmedAt ?? now;
    update.bookingConfirmedBy = userId;
  } else {
    update.bookingStatus = "negotiating";
  }

  return this.messagesModel.findOneAndUpdate(
    { brokerPostId: data.brokerPostId, carrierPostId: data.carrierPostId },
    update,
    { new: true }
  );
}
```

Modify the end of `createRoom` so it returns `{ created, room }`:

```ts
let check: any = await this.messagesModel.find({ carrierPostId: carrierPost, brokerPostId: brokerPost });
if (check.length) {
  return { created: false, room: check[0] };
}

const createdRoom = await this.messagesModel.create({
  carrierPostId: carrierPost,
  brokerId,
  carrierId,
  brokerPostId: brokerPost,
  messages: [],
  seen: { brokerCount: 0, carrierCount: 0 },
  createdBy: role,
  hiddenForBroker: false,
  hiddenForCarrier: false,
  bookingStatus: "negotiating",
  brokerApprovedBooking: false,
  carrierApprovedBooking: false,
});
await this.UserModel.updateMany({ _id: { $in: [userId, data.otherUserId] } }, { $push: { messages: createdRoom._id } });
return { created: true, room: createdRoom.toObject ? createdRoom.toObject() : createdRoom };
```

- [ ] **Step 7: Add the controller endpoint**

Modify `prometheus-backend/src/messages/messages.controller.ts` imports:

```ts
import { Body, Controller, Get, Patch, Post, Query, Req } from "@nestjs/common";
import { UpdateBookingStatusDTO } from "./dto/update-booking-status.dto";
```

Add this endpoint inside `MessagesController`:

```ts
@Roles("carrier", "broker", "admin", "manager", "supervisor")
@Patch("room/booking")
@ApiOkResponse({ status: 200, type: MessageDTO })
@ApiConsumes("multipart/form-data")
updateBookingStatus(@Body() data: UpdateBookingStatusDTO, @Req() req) {
  return this.service.updateBookingStatus(data, req.user);
}
```

- [ ] **Step 8: Verify booking lifecycle tests pass**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/messages/messages.service.spec.ts --runInBand
```

Expected: PASS with 8 tests.

- [ ] **Step 9: Commit Task 2**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/messages/dto/update-booking-status.dto.ts src/messages/interface/messages.interface.ts src/messages/schema/messages.schema.ts src/messages/messages.service.ts src/messages/messages.controller.ts src/messages/messages.service.spec.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: persist direct room booking status"
```

---

### Task 3: Backend Load Creation Guard

**Files:**
- Create: `prometheus-backend/src/loads/loads.service.spec.ts`
- Modify: `prometheus-backend/src/loads/loads.service.ts`

- [ ] **Step 1: Write the failing load guard tests**

Create `prometheus-backend/src/loads/loads.service.spec.ts`:

```ts
import { ConflictException } from "@nestjs/common";
import { LoadsService } from "./loads.service";

describe("LoadsService.createFromRoom booking guard", () => {
  const loadModel: any = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const messagesModel: any = {
    findOne: jest.fn(),
  };
  const brokerPostModel: any = {
    findById: jest.fn(),
  };
  const carrierPostModel: any = {
    findById: jest.fn(),
  };
  const userModel: any = {
    findById: jest.fn(),
  };
  const companyModel: any = {
    findById: jest.fn(),
  };

  function service() {
    return new LoadsService(loadModel, messagesModel, brokerPostModel, carrierPostModel, userModel, companyModel);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    loadModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    brokerPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "broker-post-1",
        companyId: "company-1",
        publisherId: "broker-user-1",
        origin: { type: "place", place: { city: "Chicago", state: "IL" } },
        destination: { type: "place", place: { city: "Houston", state: "TX" } },
        refNum: "LB-1",
      }),
    });
    carrierPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "carrier-post-1",
        companyId: "company-2",
        publisherId: "carrier-user-1",
        origin: { type: "place", place: { city: "Chicago", state: "IL" } },
        destination: { type: "place", place: { city: "Houston", state: "TX" } },
        equipment: ["Dry Van"],
      }),
    });
    userModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ firstName: "Demo", lastName: "User" }) });
    companyModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: "Demo Company" }) });
    loadModel.create.mockResolvedValue({
      toObject: () => ({
        _id: "load-1",
        status: "active",
        source: { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      }),
    });
  });

  it("rejects load creation while the room is still negotiating", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        bookingStatus: "negotiating",
      }),
    });

    await expect(
      service().createFromRoom(
        { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
        { _id: "broker-user-1", role: "broker", companyId: "company-1", email: "broker@test.local" }
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates a load when the room is booked", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        bookingStatus: "booked",
      }),
    });

    const result = await service().createFromRoom(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      { _id: "broker-user-1", role: "broker", companyId: "company-1", email: "broker@test.local" }
    );

    expect(loadModel.create).toHaveBeenCalled();
    expect(result.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run the load guard test and confirm it fails**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/loads/loads.service.spec.ts --runInBand
```

Expected: FAIL because `createFromRoom` does not reject negotiating rooms.

- [ ] **Step 3: Add the booking guard**

Modify `prometheus-backend/src/loads/loads.service.ts`.

The import block already includes `ConflictException`; use it near the room existence check:

```ts
if (!room || !brokerPost || !carrierPost) {
  throw new NotFoundException("Prometheus could not resolve the booked room into a load.");
}

if (String(room.bookingStatus ?? "negotiating") !== "booked") {
  throw new ConflictException("Both sides must approve the booking before Prometheus can create the load.");
}
```

- [ ] **Step 4: Verify load guard tests pass**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/loads/loads.service.spec.ts --runInBand
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/loads/loads.service.ts src/loads/loads.service.spec.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: require booked rooms for load creation"
```

---

### Task 4: Frontend Types And API Wrappers

**Files:**
- Modify: `prometheus/src/app/shared/types/models.ts`
- Create: `prometheus/src/app/core/api/matching-api.service.ts`
- Modify: `prometheus/src/app/core/api/messages-api.service.ts`

- [ ] **Step 1: Add shared match and booking types**

Modify `prometheus/src/app/shared/types/models.ts` after the `PostSearchPayload` interface:

```ts
export type MatchSourcePostType = "carrierPost" | "brokerPost";

export interface MatchScoreBreakdown {
  laneFit: number;
  equipmentFit: number;
  weightFit: number;
  freshnessFit: number;
  rateFit: number;
}

export interface MatchRouteMetrics {
  originDeadheadMiles: number | null;
  destinationDeadheadMiles: number | null;
  tripMiles: number | null;
  totalPracticalMiles: number | null;
  estimatedDriveMinutes: number | null;
  provider: string | null;
}

export interface MatchCandidateSummary {
  companyId: string;
  publisherId?: string;
  lane: {
    origin: string;
    destination: string;
  };
  equipment: string[];
  weight: number | null;
  rate: number | null;
  publishedAt: string | null;
  reference: string;
}

export interface MatchCandidate {
  matchPostId: string;
  matchPostType: MatchSourcePostType;
  score: number;
  scoreBreakdown: MatchScoreBreakdown;
  summary: MatchCandidateSummary;
  routeMetrics: MatchRouteMetrics;
}

export interface MatchSnapshot {
  _id?: string;
  companyId: string;
  sourcePostId: string;
  sourcePostType: MatchSourcePostType;
  generatedByUserId: string;
  provider: string;
  status: "ready";
  candidateCount: number;
  sourceSummary: MatchCandidateSummary & {
    availabilityStart?: string | null;
    availabilityEnd?: string | null;
    dhoRadius?: number | null;
    dhdRadius?: number | null;
  };
  candidates: MatchCandidate[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateMatchSnapshotPayload {
  sourcePostType: MatchSourcePostType;
  sourcePostId: string;
}
```

Modify `DirectRoomResponse` and `DirectRoom` to include booking fields:

```ts
export type DirectRoomBookingStatus = "negotiating" | "booked" | "cancelled" | "delivered";
```

Add these properties to both `DirectRoomResponse` and `DirectRoom`:

```ts
bookingStatus?: DirectRoomBookingStatus;
brokerApprovedBooking?: boolean;
carrierApprovedBooking?: boolean;
bookingConfirmedAt?: string | null;
bookingConfirmedBy?: string | null;
bookingRate?: number | null;
bookingNotes?: string | null;
loadId?: string | null;
bookingCancelledAt?: string | null;
bookingStatusUpdatedAt?: string | null;
bookingStatusUpdatedBy?: string | null;
```

Add the room creation response and booking payload types near the direct room interfaces:

```ts
export interface CreateDirectRoomResponse {
  created: boolean;
  room: DirectRoomResponse;
}

export interface UpdateDirectRoomBookingPayload {
  brokerPostId: string;
  carrierPostId: string;
  action: "approve" | "cancel";
  note?: string;
}
```

- [ ] **Step 2: Add the matching API service**

Create `prometheus/src/app/core/api/matching-api.service.ts`:

```ts
import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { CreateMatchSnapshotPayload, MatchSnapshot, MatchSourcePostType } from "../../shared/types/models";

@Injectable({ providedIn: "root" })
export class MatchingApiService {
  constructor(private readonly http: HttpClient) {}

  createSnapshot(payload: CreateMatchSnapshotPayload): Observable<MatchSnapshot> {
    return this.http.post<MatchSnapshot>("matching/snapshots", payload);
  }

  getLatestSnapshot(sourcePostType: MatchSourcePostType, sourcePostId: string): Observable<MatchSnapshot | null> {
    return this.http.get<MatchSnapshot | null>(`matching/snapshots/latest/${sourcePostType}/${sourcePostId}`);
  }
}
```

- [ ] **Step 3: Update the messages API service**

Modify imports in `prometheus/src/app/core/api/messages-api.service.ts`:

```ts
import {
  CreateDirectRoomResponse,
  DirectMessage,
  DirectRoomResponse,
  InboxDot,
  UpdateDirectRoomBookingPayload,
} from "../../shared/types/models";
```

Modify `createRoom` and add `updateBookingStatus`:

```ts
createRoom(payload: { myPostId: string; otherPostId: string; otherUserId: string }): Observable<CreateDirectRoomResponse> {
  return this.http.post<CreateDirectRoomResponse>("messages/room", payload);
}

updateBookingStatus(payload: UpdateDirectRoomBookingPayload): Observable<DirectRoomResponse> {
  return this.http.patch<DirectRoomResponse>("messages/room/booking", payload);
}
```

- [ ] **Step 4: Verify frontend types compile**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus\node_modules\@angular\cli\bin\ng.js' build
```

Expected: The build reaches the known budget warning stage, or fails only on Task 5 integration sites that still need updates.

- [ ] **Step 5: Commit Task 4**

Run after the build result is understood:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/app/shared/types/models.ts src/app/core/api/matching-api.service.ts src/app/core/api/messages-api.service.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: add matching and booking frontend APIs"
```

---

### Task 5: Frontend Matching Cards

**Files:**
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss`
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`

- [ ] **Step 1: Add matching inputs and outputs to the component**

Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts` imports:

```ts
import { ChatbbThreadMessage, MatchCandidate, MatchSnapshot } from "../../../shared/types/models";
```

Add inputs/outputs and helpers inside `AiMatchingConsoleComponent`:

```ts
@Input() matchSnapshot: MatchSnapshot | null = null;
@Input() matchCandidates: MatchCandidate[] = [];
@Input() matchesLoading = false;
@Input() matchError = "";
@Input() roomCreatePendingId = "";

@Output() refreshMatches = new EventEmitter<void>();
@Output() openDirectRoom = new EventEmitter<MatchCandidate>();

trackByCandidate(_: number, candidate: MatchCandidate): string {
  return `${candidate.matchPostType}-${candidate.matchPostId}`;
}

scoreLabel(candidate: MatchCandidate): string {
  return `${Math.round((candidate.score ?? 0) * 100)}%`;
}

candidateLane(candidate: MatchCandidate): string {
  return `${candidate.summary?.lane?.origin || "Origin open"} -> ${candidate.summary?.lane?.destination || "Destination open"}`;
}

candidateMeta(candidate: MatchCandidate): string {
  const equipment = candidate.summary?.equipment?.length ? candidate.summary.equipment.join(", ") : "Equipment open";
  const miles = candidate.routeMetrics?.totalPracticalMiles;
  const milesLabel = typeof miles === "number" ? `${Math.round(miles).toLocaleString("en-US")} practical mi` : "Miles pending";
  return `${equipment} | ${milesLabel}`;
}

candidateReasons(candidate: MatchCandidate): string[] {
  const breakdown = candidate.scoreBreakdown;
  return [
    `Lane ${Math.round((breakdown?.laneFit ?? 0) * 100)}%`,
    `Equipment ${Math.round((breakdown?.equipmentFit ?? 0) * 100)}%`,
    `Rate ${Math.round((breakdown?.rateFit ?? 0) * 100)}%`,
  ];
}
```

- [ ] **Step 2: Render ranked candidate cards**

Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html` inside `<section class="panel panel--matching">`, before `<section class="chat-surface">`:

```html
<section class="match-ranking-panel">
  <div class="match-ranking-panel__header">
    <div>
      <span>Matching agent</span>
      <strong>{{ matchSnapshot ? matchSnapshot.candidateCount + ' ranked candidates' : 'No snapshot yet' }}</strong>
    </div>
    <button class="secondary-button" type="button" (click)="refreshMatches.emit()" [disabled]="matchesLoading">
      {{ matchesLoading ? 'Ranking...' : 'Refresh matches' }}
    </button>
  </div>

  <div class="message-banner error" *ngIf="matchError">{{ matchError }}</div>
  <div class="loading-inline" *ngIf="matchesLoading">Prometheus is ranking the lane...</div>

  <div class="match-card-list" *ngIf="!matchesLoading && matchCandidates.length">
    <article class="match-card" *ngFor="let candidate of matchCandidates; trackBy: trackByCandidate">
      <div class="match-card__score">{{ scoreLabel(candidate) }}</div>
      <div class="match-card__body">
        <strong>{{ candidateLane(candidate) }}</strong>
        <span>{{ candidateMeta(candidate) }}</span>
        <div class="match-card__reasons">
          <em *ngFor="let reason of candidateReasons(candidate)">{{ reason }}</em>
        </div>
      </div>
      <button
        class="primary-button"
        type="button"
        (click)="openDirectRoom.emit(candidate)"
        [disabled]="roomCreatePendingId === candidate.matchPostId"
      >
        {{ roomCreatePendingId === candidate.matchPostId ? 'Opening...' : 'Open direct room' }}
      </button>
    </article>
  </div>

  <div class="empty-state" *ngIf="!matchesLoading && !matchCandidates.length && !matchError">
    Select a post and ask Prometheus to show matches for this lane.
  </div>
</section>
```

- [ ] **Step 3: Style the matching cards**

Append to `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss`:

```scss
.match-ranking-panel {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}

.match-ranking-panel__header,
.match-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.match-ranking-panel__header {
  span {
    display: block;
    color: var(--muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: var(--text);
  }
}

.match-card-list {
  display: grid;
  gap: 10px;
}

.match-card {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(13, 28, 45, 0.96);
}

.match-card__score {
  width: 58px;
  min-width: 58px;
  height: 58px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #08111d;
  background: var(--accent);
}

.match-card__body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 5px;

  strong,
  span {
    overflow-wrap: anywhere;
  }

  span {
    color: var(--muted-strong);
  }
}

.match-card__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  em {
    font-style: normal;
    padding: 4px 8px;
    border-radius: 999px;
    color: var(--muted-strong);
    background: rgba(255, 255, 255, 0.08);
  }
}

.secondary-button {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}

@media (max-width: 760px) {
  .match-ranking-panel__header,
  .match-card {
    align-items: stretch;
    flex-direction: column;
  }

  .match-card__score {
    width: 100%;
  }
}
```

- [ ] **Step 4: Pass matching inputs from the workspace shell**

Modify the `<app-ai-matching-console>` element in `prometheus/src/app/features/workspace/workspace.component.html`:

```html
<app-ai-matching-console
  *ngIf="activeTab === 'matching'"
  [matchingConsoleMessages]="matchingConsoleMessages"
  [chatbbMessages]="chatbbMessages"
  [chatbbLoading]="chatbbLoading"
  [chatbbError]="chatbbError"
  [chatbbPrompt]="chatbbPrompt"
  [dispatchRoleLabel]="dispatchRoleLabel"
  [matchSnapshot]="matchSnapshot"
  [matchCandidates]="matchCandidates"
  [matchesLoading]="matchesLoading"
  [matchError]="matchError"
  [roomCreatePendingId]="roomCreatePendingId"
  (chatbbPromptChange)="chatbbPrompt = $event"
  (submitConsole)="submitMatchingConsole()"
  (refreshMatches)="refreshSelectedPostMatches()"
  (openDirectRoom)="createRoomFromMatchCandidate($event)"
></app-ai-matching-console>
```

- [ ] **Step 5: Add matching state fields and imports**

Modify `prometheus/src/app/features/workspace/workspace.component.ts` imports:

```ts
import { MatchingApiService } from "../../core/api/matching-api.service";
import {
  MatchCandidate,
  MatchSnapshot,
  MatchSourcePostType,
} from "../../shared/types/models";
```

Add constructor injection:

```ts
private readonly matchingApi: MatchingApiService,
```

Add class fields near existing matching fields:

```ts
matchSnapshot: MatchSnapshot | null = null;
matchCandidates: MatchCandidate[] = [];
```

- [ ] **Step 6: Replace frontend search matching with backend snapshots**

Replace `loadMatchCandidates(post: WorkspacePost)` in `prometheus/src/app/features/workspace/workspace.component.ts` with:

```ts
private loadMatchCandidates(post: WorkspacePost): void {
  if (!this.user) return;
  const sourcePostType: MatchSourcePostType = this.user.role === "broker" ? "brokerPost" : "carrierPost";
  this.matchesLoading = true;
  this.matchError = "";
  this.matchSnapshot = null;
  this.matchCandidates = [];

  this.matchingApi.createSnapshot({ sourcePostType, sourcePostId: post._id })
    .pipe(finalize(() => (this.matchesLoading = false)))
    .subscribe({
      next: (snapshot) => {
        this.matchSnapshot = snapshot;
        this.matchCandidates = snapshot?.candidates ?? [];
        if (!this.matchCandidates.length) {
          this.matchError = "No ranked matches were found for this selected lane yet.";
        }
      },
      error: () => {
        this.matchSnapshot = null;
        this.matchCandidates = [];
        this.matchError = "The matching agent could not rank this lane right now.";
      },
    });
}
```

Add these public methods near `createRoomFromCandidate`:

```ts
refreshSelectedPostMatches(): void {
  if (this.selectedPost) {
    this.loadMatchCandidates(this.selectedPost);
  }
}

createRoomFromMatchCandidate(candidate: MatchCandidate): void {
  const selectedPost = this.selectedPost;
  if (!selectedPost) return;
  const asWorkspacePost: WorkspacePost = {
    _id: candidate.matchPostId,
    publisherId: candidate.summary.publisherId,
    origin: { type: "place", place: candidate.summary.lane.origin },
    destination: { type: "place", place: candidate.summary.lane.destination },
    equipment: candidate.summary.equipment,
    weight: candidate.summary.weight,
    rate: candidate.summary.rate,
    publishedAt: candidate.summary.publishedAt,
    refNum: candidate.summary.reference,
  };
  this.createRoomFromCandidate(asWorkspacePost);
}
```

- [ ] **Step 7: Verify frontend build**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus\node_modules\@angular\cli\bin\ng.js' build
```

Expected: Build completes with the existing budget warnings only.

- [ ] **Step 8: Commit Task 5**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/app/features/workspace/ai-matching-console src/app/features/workspace/workspace.component.html src/app/features/workspace/workspace.component.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: show ranked match snapshots"
```

---

### Task 6: Frontend Booking Confirmation And Load Guard UI

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`

- [ ] **Step 1: Normalize room booking fields**

Modify `normalizeRoom(room: DirectRoomResponse)` in `prometheus/src/app/features/workspace/workspace.component.ts` so the returned `DirectRoom` includes:

```ts
bookingStatus: room.bookingStatus ?? "negotiating",
brokerApprovedBooking: Boolean(room.brokerApprovedBooking),
carrierApprovedBooking: Boolean(room.carrierApprovedBooking),
bookingConfirmedAt: room.bookingConfirmedAt ?? null,
bookingConfirmedBy: room.bookingConfirmedBy ?? null,
bookingRate: room.bookingRate ?? null,
bookingNotes: room.bookingNotes ?? null,
loadId: room.loadId ?? null,
bookingCancelledAt: room.bookingCancelledAt ?? null,
bookingStatusUpdatedAt: room.bookingStatusUpdatedAt ?? null,
bookingStatusUpdatedBy: room.bookingStatusUpdatedBy ?? null,
```

- [ ] **Step 2: Update direct room creation handling**

Modify `createRoomFromCandidate(candidate: WorkspacePost)` success handling because `MessagesApiService.createRoom` now returns `{ created, room }`:

```ts
next: (response) => {
  this.roomCreateMessage = response.created
    ? "Direct room created and loaded into the workspace."
    : "That room already existed. The workspace loaded the existing conversation.";
  this.appendMatchingBubble("assistant", this.roomCreateMessage, "Prometheus");
  this.activeTab = "direct";
  this.activeDirectConsoleView = "main";
  this.loadRooms(selectedPost, candidateId);
},
```

- [ ] **Step 3: Add booking status action methods**

Add methods near existing `approveSelectedBooking`:

```ts
confirmSelectedBookingApproval(): void {
  const room = this.selectedRoom;
  if (!room || !this.user) return;
  this.messagesApi.updateBookingStatus({
    brokerPostId: room.brokerPostId,
    carrierPostId: room.carrierPostId,
    action: "approve",
  }).subscribe({
    next: (updated) => {
      this.applyUpdatedRoom(updated);
      this.loadMessage = "Booking approval saved. Prometheus will create the load after both sides approve.";
    },
    error: () => {
      this.loadError = "Prometheus could not save booking approval.";
    },
  });
}

cancelSelectedBookingApproval(): void {
  const room = this.selectedRoom;
  if (!room || !this.user) return;
  this.messagesApi.updateBookingStatus({
    brokerPostId: room.brokerPostId,
    carrierPostId: room.carrierPostId,
    action: "cancel",
  }).subscribe({
    next: (updated) => {
      this.applyUpdatedRoom(updated);
      this.loadMessage = "Booking approval was cancelled for this room.";
    },
    error: () => {
      this.loadError = "Prometheus could not cancel the booking approval.";
    },
  });
}

private applyUpdatedRoom(updated: DirectRoomResponse): void {
  const normalized = this.normalizeRoom(updated);
  this.rooms = this.rooms.map((room) => room.id === normalized.id ? { ...room, ...normalized } : room);
  this.previewDirectRooms = this.previewDirectRooms.map((room) => room.id === normalized.id ? { ...room, ...normalized } : room);
  this.ensureDirectRoomWorkflow(normalized.id);
}
```

- [ ] **Step 4: Derive booking readiness from API state**

Modify `selectedRoomBookingReady`:

```ts
get selectedRoomBookingReady(): boolean {
  return this.selectedRoom?.bookingStatus === "booked";
}
```

Add:

```ts
bookingStatusLabel(room: DirectRoom | null | undefined): string {
  const status = room?.bookingStatus ?? "negotiating";
  const labels: Record<string, string> = {
    negotiating: "Negotiating",
    booked: "Booked",
    cancelled: "Cancelled",
    delivered: "Delivered",
  };
  return labels[status] ?? "Negotiating";
}
```

- [ ] **Step 5: Guard load creation in the UI**

At the top of `createLoadFromSelectedRoom()` add:

```ts
if (this.selectedRoom?.bookingStatus !== "booked") {
  this.loadError = "Both sides must approve this direct room before Prometheus can create the load.";
  return;
}
```

- [ ] **Step 6: Render booking controls**

In `prometheus/src/app/features/workspace/workspace.component.html`, in the Direct room detail area where the selected room actions already appear, render:

```html
<div class="booking-state-strip" *ngIf="selectedRoom">
  <span>{{ bookingStatusLabel(selectedRoom) }}</span>
  <strong *ngIf="selectedRoom.brokerApprovedBooking">Broker approved</strong>
  <strong *ngIf="selectedRoom.carrierApprovedBooking">Carrier approved</strong>
  <button class="secondary-button" type="button" (click)="confirmSelectedBookingApproval()" [disabled]="selectedRoom.bookingStatus === 'booked'">
    Approve booking
  </button>
  <button class="secondary-button" type="button" (click)="cancelSelectedBookingApproval()" [disabled]="selectedRoom.bookingStatus === 'cancelled'">
    Cancel approval
  </button>
</div>
```

Use the existing button classes in this template; if `.booking-state-strip` needs styling, add it to `workspace.component.scss` in the same task with:

```scss
.booking-state-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);

  span,
  strong {
    color: var(--text);
  }
}
```

- [ ] **Step 7: Verify frontend build**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus\node_modules\@angular\cli\bin\ng.js' build
```

Expected: Build completes with the existing budget warnings only.

- [ ] **Step 8: Commit Task 6**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/app/features/workspace/workspace.component.ts src/app/features/workspace/workspace.component.html src/app/features/workspace/workspace.component.scss
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: connect booking confirmation UI"
```

---

### Task 7: ChatBB Human-Approved Action Buttons

**Files:**
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`

- [ ] **Step 1: Add ChatBB action output**

Modify `AiMatchingConsoleComponent` imports:

```ts
import { ChatbbAction, ChatbbThreadMessage, MatchCandidate, MatchSnapshot } from "../../../shared/types/models";
```

Add output and helper:

```ts
@Output() runChatbbAction = new EventEmitter<ChatbbAction>();

messageActions(message: ChatbbThreadMessage): ChatbbAction[] {
  return message.plan?.recommendedActions ?? [];
}
```

- [ ] **Step 2: Render recommended action buttons**

In `ai-matching-console.component.html`, inside the ChatBB message article after `<p>{{ message.text }}</p>`, add:

```html
<div class="chat-action-row" *ngIf="message.sender === 'assistant' && messageActions(message).length">
  <button
    class="secondary-button"
    type="button"
    *ngFor="let action of messageActions(message)"
    (click)="runChatbbAction.emit(action)"
  >
    {{ action.requiresApproval ? 'Review: ' + action.label : action.label }}
  </button>
</div>
```

Add styling:

```scss
.chat-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 3: Connect safe frontend action mapping**

Modify `<app-ai-matching-console>` in `workspace.component.html`:

```html
(runChatbbAction)="handleChatbbAction($event)"
```

Add this method to `WorkspaceComponent`:

```ts
handleChatbbAction(action: ChatbbAction): void {
  const type = String(action.type ?? "");
  if (type === "draft_counter_offer" || type === "draft_availability_check") {
    const latestAssistant = [...this.chatbbMessages].reverse().find((message) => message.sender === "assistant");
    const draft = latestAssistant?.plan?.draftMessage ?? "";
    this.directMessage = draft;
    this.chatbbPrompt = "";
    this.chatbbError = "";
    this.appendBookingAssistantMessage("assistant", "I placed the draft in the message box. Press Send only after you review it.");
    return;
  }

  if (type === "show_top_bids" || type === "review_recent_options" || type === "summarize_room") {
    this.chatbbPrompt = action.label;
    this.sendChatbbMessage(action.label);
    return;
  }

  this.chatbbError = "Prometheus can draft this action, but it needs a mapped workflow before it can run.";
}
```

This method must never call `sendDirectMessage`, `createRoomFromCandidate`, `confirmSelectedBookingApproval`, or `createLoadFromSelectedRoom` directly. Those actions remain separate user clicks.

- [ ] **Step 4: Verify frontend build**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus\node_modules\@angular\cli\bin\ng.js' build
```

Expected: Build completes with the existing budget warnings only.

- [ ] **Step 5: Commit Task 7**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/app/features/workspace/ai-matching-console src/app/features/workspace/workspace.component.ts src/app/features/workspace/workspace.component.html
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: require review for ChatBB actions"
```

---

### Task 8: Demo Seed And API Smoke

**Files:**
- Modify: `prometheus-backend/scripts/seed-local-demo.js`

- [ ] **Step 1: Add booking state to seeded rooms**

In each `upsertMessageRoom` data object in `prometheus-backend/scripts/seed-local-demo.js`, add explicit room state:

For the first seeded room:

```js
bookingStatus: "booked",
brokerApprovedBooking: true,
carrierApprovedBooking: true,
bookingConfirmedAt: new Date(now.getTime() + 30 * 60 * 1000),
bookingConfirmedBy: brokerUser._id.toString(),
bookingStatusUpdatedAt: new Date(now.getTime() + 30 * 60 * 1000),
bookingStatusUpdatedBy: brokerUser._id.toString(),
bookingNotes: "Seeded booked room for load creation smoke tests.",
```

For the second seeded room:

```js
bookingStatus: "negotiating",
brokerApprovedBooking: true,
carrierApprovedBooking: false,
bookingStatusUpdatedAt: new Date(now.getTime() + 16 * 60 * 1000),
bookingStatusUpdatedBy: brokerUser._id.toString(),
bookingNotes: "Seeded broker approval awaiting carrier confirmation.",
```

For the third seeded room:

```js
bookingStatus: "negotiating",
brokerApprovedBooking: false,
carrierApprovedBooking: false,
bookingStatusUpdatedAt: new Date(now.getTime() + 26 * 60 * 1000),
bookingStatusUpdatedBy: carrierUser._id.toString(),
bookingNotes: "Seeded negotiating room.",
```

- [ ] **Step 2: Run focused backend tests**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/matching/matching.controller.spec.ts src/messages/messages.service.spec.ts src/loads/loads.service.spec.ts --runInBand
```

Expected: PASS for matching, messages, and loads specs.

- [ ] **Step 3: Run backend build**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\@nestjs\cli\bin\nest.js' build
```

Expected: Build succeeds.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus\node_modules\@angular\cli\bin\ng.js' build
```

Expected: Build succeeds with existing budget warnings only.

- [ ] **Step 5: Reseed local demo data**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' scripts\seed-local-demo.js
```

Expected output includes:

```text
Local demo data is ready.
Login credentials:
superadmin.local@prometheus.test / Prometheus123!
setup.admin.local@prometheus.test / Prometheus123!
broker.local@prometheus.test / Prometheus123!
carrier.local@prometheus.test / Prometheus123!
```

- [ ] **Step 6: Restart local servers**

If servers are already running, stop only the known local backend/frontend processes for this workspace, then restart:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'dist/main.js' -WorkingDirectory 'C:\Prometheus-Clean\prometheus-backend' -RedirectStandardOutput 'C:\Prometheus-Clean\prometheus-backend\local-backend.operations-core.log' -RedirectStandardError 'C:\Prometheus-Clean\prometheus-backend\local-backend.operations-core.err.log' -WindowStyle Hidden

Set-Location C:\Prometheus-Clean\prometheus
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'C:\Prometheus-Clean\prometheus\node_modules\@angular\cli\bin\ng.js serve --port 4300' -WorkingDirectory 'C:\Prometheus-Clean\prometheus' -RedirectStandardOutput 'C:\Prometheus-Clean\prometheus\local-frontend.operations-core.log' -RedirectStandardError 'C:\Prometheus-Clean\prometheus\local-frontend.operations-core.err.log' -WindowStyle Hidden
```

- [ ] **Step 7: Run local API smoke checks**

Use broker login, create a snapshot for one broker post, approve the seeded booked room if needed, and create a load from the seeded booked room.

The exact smoke script can be a one-off PowerShell sequence that:

1. Logs in as `broker.local@prometheus.test`.
2. Reads broker posts from `GET /broker/mine/{userId}` or existing workspace API path used by the app.
3. Calls `POST /matching/snapshots` with `{ "sourcePostType": "brokerPost", "sourcePostId": "<brokerPostId>" }`.
4. Calls `PATCH /messages/room/booking` on a negotiating room twice only if testing both roles manually.
5. Calls `POST /loads/from-room` for the seeded `booked` room.
6. Verifies `GET /loads/company` returns the new load.

Expected:

```text
snapshot.candidateCount >= 1
booked room create load returns status active
negotiating room create load returns 409 Conflict
```

- [ ] **Step 8: Commit Task 8**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add scripts/seed-local-demo.js
& 'C:\Program Files\Git\cmd\git.exe' commit -m "chore: seed operations booking states"
```

---

## Final Verification

Run these commands before claiming the milestone is complete:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\jest\bin\jest.js' src/matching/matching.controller.spec.ts src/messages/messages.service.spec.ts src/loads/loads.service.spec.ts --runInBand
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus-backend\node_modules\@nestjs\cli\bin\nest.js' build
& 'C:\Program Files\nodejs\node.exe' scripts\seed-local-demo.js

Set-Location C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\prometheus\node_modules\@angular\cli\bin\ng.js' build

Set-Location C:\Prometheus-Clean
& 'C:\Program Files\Git\cmd\git.exe' status --short
```

Expected final state:

- Focused Jest specs pass.
- Backend build passes.
- Frontend build passes with existing budget warnings only.
- Local seed succeeds.
- `git status --short` is clean after final commit.

## Manual Browser Smoke

After the local servers are restarted:

1. Open `http://localhost:4300/sign-in`.
2. Sign in as `broker.local@prometheus.test / Prometheus123!`.
3. Open the workspace matching tab.
4. Select a broker post and refresh matches.
5. Confirm ranked candidate cards show score, route, equipment, reasons, and `Open direct room`.
6. Open a direct room from a ranked candidate.
7. Confirm the direct room shows booking status.
8. Approve the booking from broker side.
9. Sign in as `carrier.local@prometheus.test / Prometheus123!` and approve the same room.
10. Confirm the room status becomes `Booked`.
11. Create the load from the booked room.
12. Confirm the load appears in Loads Console as `active`.
13. Confirm trying to create a load from a non-booked room shows the guard message instead of creating a load.

## Completion Criteria

- Matching uses backend snapshots, not only frontend search.
- Match candidates are ranked and visually explain why they matched.
- Direct rooms persist booking status in MongoDB.
- Both broker and carrier approval are represented before load creation.
- `LoadsService.createFromRoom` refuses non-booked rooms.
- ChatBB action buttons fill drafts or request summaries, but do not submit external or operational actions without a separate user click.
- Demo seed supports a booked room, a partially approved room, and a negotiating room.
- Stripe and DigitalOcean remain untouched in this milestone.
