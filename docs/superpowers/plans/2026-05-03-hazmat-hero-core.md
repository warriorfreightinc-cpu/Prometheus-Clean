# Hazmat Hero Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real-time Hazmat Hero assistant flow: automatic hazmat-first match opportunities, guided near-match suggestions, permission questions, and booking handoff from the Matching Console.

**Architecture:** Keep the deterministic matching facts in the NestJS backend and keep the Matching Console conversation-first in Angular. Extend the existing `MatchingService` with a pure hazmat classifier, persisted match opportunities, assistant conversation events, command endpoints, and post-create triggers. The LLM remains optional; this slice uses deterministic assistant copy so the product works even when OpenAI or LM Studio is unavailable.

**Tech Stack:** NestJS 10, Mongoose, Jest, Angular 16, RxJS, Socket.IO client, existing `MatchingApiService`, existing `MessagesApiService`, existing `AppGateway`.

---

## File Map

Create:

- `prometheus-backend/src/matching/hazmat-match-classifier.ts`
- `prometheus-backend/src/matching/hazmat-match-classifier.spec.ts`
- `prometheus-backend/src/matching/interface/match-opportunity.interface.ts`
- `prometheus-backend/src/matching/interface/matching-assistant-event.interface.ts`
- `prometheus-backend/src/matching/schema/match-opportunity.schema.ts`
- `prometheus-backend/src/matching/schema/matching-assistant-event.schema.ts`
- `prometheus-backend/src/matching/dto/matching-assistant.dto.ts`
- `prometheus-backend/src/matching/matching-assistant.service.ts`
- `prometheus-backend/src/matching/matching-assistant.service.spec.ts`
- `prometheus/src/app/core/realtime/prometheus-socket.service.ts`

Modify:

- `prometheus-backend/src/matching/interface/match-snapshot.interface.ts`
- `prometheus-backend/src/matching/schema/match-snapshot.schema.ts`
- `prometheus-backend/src/matching/dto/matching.dto.ts`
- `prometheus-backend/src/matching/matching.service.ts`
- `prometheus-backend/src/matching/matching.service.spec.ts`
- `prometheus-backend/src/matching/matching.controller.ts`
- `prometheus-backend/src/matching/matching.controller.spec.ts`
- `prometheus-backend/src/matching/matching.module.ts`
- `prometheus-backend/src/post-broker/post.module.ts`
- `prometheus-backend/src/post-broker/post.service.ts`
- `prometheus-backend/src/post-carrier/post.module.ts`
- `prometheus-backend/src/post-carrier/post.service.ts`
- `prometheus-backend/package.json`
- `prometheus/package.json`
- `prometheus/src/app/shared/types/models.ts`
- `prometheus/src/app/core/api/matching-api.service.ts`
- `prometheus/src/app/features/workspace/workspace.component.ts`
- `prometheus/src/app/features/workspace/workspace.component.spec.ts`
- `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`
- `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
- `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts`

---

### Task 1: Add Deterministic Hazmat Tier Classifier

**Files:**
- Create: `prometheus-backend/src/matching/hazmat-match-classifier.ts`
- Create: `prometheus-backend/src/matching/hazmat-match-classifier.spec.ts`

- [ ] **Step 1: Write the failing classifier tests**

Create `prometheus-backend/src/matching/hazmat-match-classifier.spec.ts`:

```ts
import {
  classifyHazmatCandidate,
  normalizeEquipmentCodes,
} from "./hazmat-match-classifier";

describe("hazmat match classifier", () => {
  it("normalizes hazmat equipment codes without losing base equipment", () => {
    expect(normalizeEquipmentCodes(["v", "VZ", " reefer hazmat "])).toEqual([
      "V",
      "VZ",
      "RZ",
    ]);
  });

  it("classifies exact hazmat equipment and safe weight as strict hazmat", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 44000,
      candidateWeight: 41000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("strictHazmat");
    expect(decision.equipmentCompatibility).toBe("exact");
    expect(decision.permissionStatus).toBe("notNeeded");
    expect(decision.hazmatCompatible).toBe(true);
  });

  it("classifies RZ truck against VZ load as a permission-based hazmat substitution", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["RZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 44000,
      candidateWeight: 40000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("hazmatPermission");
    expect(decision.equipmentCompatibility).toBe("requiresPermission");
    expect(decision.permissionQuestion).toContain("reefer");
    expect(decision.permissionQuestion).toContain("van hazmat");
  });

  it("places non-hazmat candidates in the fallback tier", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["V"],
      sourceWeight: 44000,
      candidateWeight: 38000,
      sourceNonHazmat: false,
      candidateNonHazmat: true,
    });

    expect(decision.tier).toBe("nonHazmatFallback");
    expect(decision.hazmatCompatible).toBe(false);
  });

  it("marks overweight load candidates as rejected by weight", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 41000,
      candidateWeight: 45000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("hazmatMarketAlternative");
    expect(decision.reasonCodes).toContain("overweight");
  });
});
```

- [ ] **Step 2: Run the backend test and confirm it fails**

Run:

```powershell
npm test -- hazmat-match-classifier.spec.ts --runInBand
```

Expected: FAIL because `hazmat-match-classifier.ts` does not exist.

- [ ] **Step 3: Add the classifier implementation**

Create `prometheus-backend/src/matching/hazmat-match-classifier.ts`:

```ts
import { MatchSourcePostType } from "./interface/match-snapshot.interface";

export type MatchOpportunityTier =
  | "strictHazmat"
  | "hazmatNearMatch"
  | "hazmatPermission"
  | "hazmatMarketAlternative"
  | "nonHazmatFallback";

export type EquipmentCompatibility =
  | "exact"
  | "compatible"
  | "requiresPermission"
  | "incompatible";

export type PermissionStatus =
  | "notNeeded"
  | "notAsked"
  | "asked"
  | "accepted"
  | "rejected"
  | "expired";

export interface HazmatCandidateInput {
  sourcePostType: MatchSourcePostType;
  sourceEquipment: unknown;
  candidateEquipment: unknown;
  sourceWeight: number | null;
  candidateWeight: number | null;
  sourceNonHazmat?: boolean;
  candidateNonHazmat?: boolean;
}

export interface HazmatCandidateDecision {
  tier: MatchOpportunityTier;
  hazmatCompatible: boolean;
  equipmentCompatibility: EquipmentCompatibility;
  permissionStatus: PermissionStatus;
  permissionQuestion: string;
  reasonCodes: string[];
}

const EQUIPMENT_ALIASES: Record<string, string> = {
  V: "V",
  VAN: "V",
  "DRY VAN": "V",
  VZ: "VZ",
  "VAN HAZMAT": "VZ",
  R: "R",
  REEFER: "R",
  RZ: "RZ",
  "REEFER HAZMAT": "RZ",
  F: "F",
  FLATBED: "F",
  FZ: "FZ",
  "FLATBED HAZMAT": "FZ",
};

const HAZMAT_CODES = new Set(["VZ", "RZ", "FZ", "CZ", "TZ"]);

export function normalizeEquipmentCodes(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : [value];
  const codes = rawItems
    .map((item) => String(item ?? "").trim().toUpperCase())
    .filter(Boolean)
    .map((item) => EQUIPMENT_ALIASES[item] ?? item);
  return [...new Set(codes)];
}

export function classifyHazmatCandidate(input: HazmatCandidateInput): HazmatCandidateDecision {
  const sourceEquipment = normalizeEquipmentCodes(input.sourceEquipment);
  const candidateEquipment = normalizeEquipmentCodes(input.candidateEquipment);
  const reasonCodes: string[] = [];

  const sourceHazmat = !input.sourceNonHazmat && sourceEquipment.some((code) => HAZMAT_CODES.has(code));
  const candidateHazmat = !input.candidateNonHazmat && candidateEquipment.some((code) => HAZMAT_CODES.has(code));

  if (!sourceHazmat || !candidateHazmat) {
    return {
      tier: "nonHazmatFallback",
      hazmatCompatible: false,
      equipmentCompatibility: "incompatible",
      permissionStatus: "notAsked",
      permissionQuestion: "",
      reasonCodes: ["nonHazmatFallback"],
    };
  }

  const exact = sourceEquipment.some((code) => candidateEquipment.includes(code));
  const reeferToVan =
    sourceEquipment.includes("RZ") && candidateEquipment.includes("VZ");
  const vanToReefer =
    sourceEquipment.includes("VZ") && candidateEquipment.includes("RZ");
  const requiresPermission = reeferToVan || vanToReefer;

  const overweight =
    input.sourcePostType === "carrierPost" &&
    input.sourceWeight !== null &&
    input.candidateWeight !== null &&
    input.candidateWeight > input.sourceWeight;

  if (overweight) {
    reasonCodes.push("overweight");
  }

  if (requiresPermission && !overweight) {
    return {
      tier: "hazmatPermission",
      hazmatCompatible: true,
      equipmentCompatibility: "requiresPermission",
      permissionStatus: "notAsked",
      permissionQuestion: reeferToVan
        ? "Can this van hazmat load move safely on reefer hazmat equipment?"
        : "Can this reefer hazmat load move safely on van hazmat equipment?",
      reasonCodes: ["equipmentPermission"],
    };
  }

  if (exact && !overweight) {
    return {
      tier: "strictHazmat",
      hazmatCompatible: true,
      equipmentCompatibility: "exact",
      permissionStatus: "notNeeded",
      permissionQuestion: "",
      reasonCodes,
    };
  }

  return {
    tier: overweight ? "hazmatMarketAlternative" : "hazmatNearMatch",
    hazmatCompatible: true,
    equipmentCompatibility: exact ? "exact" : "compatible",
    permissionStatus: "notNeeded",
    permissionQuestion: "",
    reasonCodes: reasonCodes.length ? reasonCodes : ["nearMatch"],
  };
}
```

- [ ] **Step 4: Run the classifier test and confirm it passes**

Run:

```powershell
npm test -- hazmat-match-classifier.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add prometheus-backend/src/matching/hazmat-match-classifier.ts prometheus-backend/src/matching/hazmat-match-classifier.spec.ts
git commit -m "feat: add hazmat match classifier"
```

---

### Task 2: Persist Match Opportunity Metadata

**Files:**
- Create: `prometheus-backend/src/matching/interface/match-opportunity.interface.ts`
- Create: `prometheus-backend/src/matching/schema/match-opportunity.schema.ts`
- Modify: `prometheus-backend/src/matching/interface/match-snapshot.interface.ts`
- Modify: `prometheus-backend/src/matching/schema/match-snapshot.schema.ts`
- Modify: `prometheus-backend/src/matching/matching.module.ts`
- Modify: `prometheus-backend/src/matching/matching.service.ts`
- Modify: `prometheus-backend/src/matching/matching.service.spec.ts`

- [ ] **Step 1: Write the failing service tests**

Append these tests to `prometheus-backend/src/matching/matching.service.spec.ts`:

```ts
  it("adds hazmat tier metadata to snapshot candidates", async () => {
    const { service, carrierPostModel, brokerService } = createService();
    carrierPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "carrier-post-1",
        companyId: "carrier-company-1",
        publisherId: "carrier-user-1",
        weight: 44000,
        equipment: ["RZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      }),
    });
    brokerService.search.mockResolvedValue([
      {
        _id: "broker-post-1",
        companyId: "broker-company-1",
        publisherId: "broker-user-1",
        weight: 40000,
        rate: 2800,
        equipment: ["VZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      },
    ]);

    const snapshot = await service.createSnapshotForCarrierPost("carrier-post-1", "carrier-user-1");

    expect(snapshot.candidates[0].tier).toBe("hazmatPermission");
    expect(snapshot.candidates[0].equipmentCompatibility).toBe("requiresPermission");
    expect(snapshot.candidates[0].permissionQuestion).toContain("reefer hazmat");
  });
```

Also update the `createService` helper in the same spec so it passes a mock opportunity model:

```ts
const opportunityModel = {
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
};
```

and constructor call:

```ts
const service = new MatchingService(
  snapshotModel as any,
  opportunityModel as any,
  brokerPostModel as any,
  carrierPostModel as any,
  brokerService as any,
  carrierService as any,
  routingService as any
);
```

- [ ] **Step 2: Run the matching service test and confirm it fails**

Run:

```powershell
npm test -- matching.service.spec.ts --runInBand
```

Expected: FAIL because `MatchCandidate` has no `tier` and the service constructor has not been updated.

- [ ] **Step 3: Add opportunity interfaces**

Create `prometheus-backend/src/matching/interface/match-opportunity.interface.ts`:

```ts
import { Document } from "mongoose";
import {
  EquipmentCompatibility,
  MatchOpportunityTier,
  PermissionStatus,
} from "../hazmat-match-classifier";
import { MatchSourcePostType } from "./match-snapshot.interface";

export type MatchOpportunityStatus =
  | "suggested"
  | "skipped"
  | "negotiating"
  | "approvedForBooking"
  | "booked"
  | "rejected"
  | "expired";

export interface MatchOpportunity extends Document {
  companyId: string;
  sourcePostType: MatchSourcePostType;
  sourcePostId: string;
  candidatePostType: MatchSourcePostType;
  candidatePostId: string;
  sourcePublisherId?: string;
  candidatePublisherId?: string;
  tier: MatchOpportunityTier;
  tierRank: number;
  score: number;
  hazmatCompatible: boolean;
  equipmentCompatibility: EquipmentCompatibility;
  permissionQuestion: string;
  permissionStatus: PermissionStatus;
  status: MatchOpportunityStatus;
  reasonCodes: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
```

- [ ] **Step 4: Add opportunity schema**

Create `prometheus-backend/src/matching/schema/match-opportunity.schema.ts`:

```ts
import * as mongoose from "mongoose";
import { MatchOpportunity } from "../interface/match-opportunity.interface";

export const MatchOpportunitySchema = new mongoose.Schema<MatchOpportunity>(
  {
    companyId: { type: String, index: true },
    sourcePostType: { type: String, enum: ["carrierPost", "brokerPost"], index: true },
    sourcePostId: { type: String, index: true },
    candidatePostType: { type: String, enum: ["carrierPost", "brokerPost"], index: true },
    candidatePostId: { type: String, index: true },
    sourcePublisherId: String,
    candidatePublisherId: String,
    tier: {
      type: String,
      enum: ["strictHazmat", "hazmatNearMatch", "hazmatPermission", "hazmatMarketAlternative", "nonHazmatFallback"],
      index: true,
    },
    tierRank: { type: Number, index: true },
    score: Number,
    hazmatCompatible: Boolean,
    equipmentCompatibility: {
      type: String,
      enum: ["exact", "compatible", "requiresPermission", "incompatible"],
      index: true,
    },
    permissionQuestion: String,
    permissionStatus: {
      type: String,
      enum: ["notNeeded", "notAsked", "asked", "accepted", "rejected", "expired"],
      default: "notAsked",
      index: true,
    },
    status: {
      type: String,
      enum: ["suggested", "skipped", "negotiating", "approvedForBooking", "booked", "rejected", "expired"],
      default: "suggested",
      index: true,
    },
    reasonCodes: [String],
  },
  {
    timestamps: true,
    collection: "matchopportunities",
  }
);

MatchOpportunitySchema.index(
  { sourcePostType: 1, sourcePostId: 1, candidatePostType: 1, candidatePostId: 1 },
  { unique: true }
);
MatchOpportunitySchema.index({ companyId: 1, status: 1, tierRank: 1, score: -1, updatedAt: -1 });
```

- [ ] **Step 5: Extend candidate interfaces and schema**

In `prometheus-backend/src/matching/interface/match-snapshot.interface.ts`, import classifier types:

```ts
import {
  EquipmentCompatibility,
  MatchOpportunityTier,
  PermissionStatus,
} from "../hazmat-match-classifier";
```

Extend `MatchCandidate`:

```ts
  tier: MatchOpportunityTier;
  hazmatCompatible: boolean;
  equipmentCompatibility: EquipmentCompatibility;
  permissionStatus: PermissionStatus;
  permissionQuestion: string;
  reasonCodes: string[];
```

In `prometheus-backend/src/matching/schema/match-snapshot.schema.ts`, add the same fields to `MatchCandidateSchema`:

```ts
    tier: {
      type: String,
      enum: ["strictHazmat", "hazmatNearMatch", "hazmatPermission", "hazmatMarketAlternative", "nonHazmatFallback"],
    },
    hazmatCompatible: Boolean,
    equipmentCompatibility: {
      type: String,
      enum: ["exact", "compatible", "requiresPermission", "incompatible"],
    },
    permissionStatus: {
      type: String,
      enum: ["notNeeded", "notAsked", "asked", "accepted", "rejected", "expired"],
    },
    permissionQuestion: String,
    reasonCodes: [String],
```

- [ ] **Step 6: Register the opportunity model**

In `prometheus-backend/src/matching/matching.module.ts`, import:

```ts
import { MatchOpportunitySchema } from "./schema/match-opportunity.schema";
```

Add to `MongooseModule.forFeature`:

```ts
{ name: "matchOpportunity", schema: MatchOpportunitySchema },
```

- [ ] **Step 7: Classify candidates and upsert opportunities**

In `prometheus-backend/src/matching/matching.service.ts`, import:

```ts
import { classifyHazmatCandidate } from "./hazmat-match-classifier";
import { MatchOpportunity } from "./interface/match-opportunity.interface";
```

Add constructor parameter after `snapshotModel`:

```ts
@InjectModel("matchOpportunity")
private readonly opportunityModel: Model<MatchOpportunity>,
```

Inside `buildCandidate`, after `const score = ...`, add:

```ts
const decision = classifyHazmatCandidate({
  sourcePostType,
  sourceEquipment: sourcePost.equipment,
  candidateEquipment: match.equipment,
  sourceWeight: this.toNumber(sourcePost.weight),
  candidateWeight: this.toNumber(match.weight),
  sourceNonHazmat: Boolean(sourcePost.nonHazmat),
  candidateNonHazmat: Boolean(match.nonHazmat),
});
```

Add these properties to the returned candidate:

```ts
      tier: decision.tier,
      hazmatCompatible: decision.hazmatCompatible,
      equipmentCompatibility: decision.equipmentCompatibility,
      permissionStatus: decision.permissionStatus,
      permissionQuestion: decision.permissionQuestion,
      reasonCodes: decision.reasonCodes,
```

After `const candidates = await Promise.all(...)` in `persistSnapshot`, sort:

```ts
const sortedCandidates = candidates.sort((left, right) => {
  const tierOrder = {
    strictHazmat: 0,
    hazmatNearMatch: 1,
    hazmatPermission: 2,
    hazmatMarketAlternative: 3,
    nonHazmatFallback: 4,
  };
  const leftTier = tierOrder[left.tier] ?? 99;
  const rightTier = tierOrder[right.tier] ?? 99;
  return leftTier === rightTier ? right.score - left.score : leftTier - rightTier;
});
```

Add this helper near the other private helpers:

```ts
private tierRank(tier: string): number {
  const tierOrder = {
    strictHazmat: 0,
    hazmatNearMatch: 1,
    hazmatPermission: 2,
    hazmatMarketAlternative: 3,
    nonHazmatFallback: 4,
  };
  return tierOrder[tier] ?? 99;
}
```

Use `sortedCandidates` for `candidateCount`, `candidates`, and opportunity persistence.

Add this private method:

```ts
private async persistOpportunities(
  sourcePostType: MatchSourcePostType,
  sourcePost: any,
  candidates: MatchCandidate[]
): Promise<void> {
  await Promise.all(candidates.map((candidate) =>
    this.opportunityModel.findOneAndUpdate(
      {
        sourcePostType,
        sourcePostId: String(sourcePost._id),
        candidatePostType: candidate.matchPostType,
        candidatePostId: candidate.matchPostId,
      },
      {
        $set: {
          companyId: String(sourcePost.companyId ?? ""),
          sourcePublisherId: this.cleanString(sourcePost.publisherId) || undefined,
          candidatePublisherId: candidate.summary.publisherId,
          tier: candidate.tier,
          tierRank: this.tierRank(candidate.tier),
          score: candidate.score,
          hazmatCompatible: candidate.hazmatCompatible,
          equipmentCompatibility: candidate.equipmentCompatibility,
          permissionQuestion: candidate.permissionQuestion,
          permissionStatus: candidate.permissionStatus,
          status: "suggested",
          reasonCodes: candidate.reasonCodes,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  ));
}
```

Call it inside `persistSnapshot` before creating the snapshot:

```ts
await this.persistOpportunities(sourcePostType, sourcePost, sortedCandidates);
```

- [ ] **Step 8: Run matching tests**

Run:

```powershell
npm test -- matching.service.spec.ts hazmat-match-classifier.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Run:

```powershell
git add prometheus-backend/src/matching
git commit -m "feat: persist hazmat match opportunities"
```

---

### Task 3: Add Assistant Events And Commands

**Files:**
- Create: `prometheus-backend/src/matching/interface/matching-assistant-event.interface.ts`
- Create: `prometheus-backend/src/matching/schema/matching-assistant-event.schema.ts`
- Create: `prometheus-backend/src/matching/dto/matching-assistant.dto.ts`
- Create: `prometheus-backend/src/matching/matching-assistant.service.ts`
- Create: `prometheus-backend/src/matching/matching-assistant.service.spec.ts`
- Modify: `prometheus-backend/src/matching/matching.controller.ts`
- Modify: `prometheus-backend/src/matching/matching.module.ts`

- [ ] **Step 1: Write assistant service tests**

Create `prometheus-backend/src/matching/matching-assistant.service.spec.ts`:

```ts
jest.mock("src/gateway/app.gateway", () => ({ AppGateway: class {} }), { virtual: true });
jest.mock("src/messages/messages.service", () => ({ MessagesService: class {} }), { virtual: true });

import { MatchingAssistantService } from "./matching-assistant.service";

describe("MatchingAssistantService", () => {
  const opportunityModel: any = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const eventModel: any = {
    create: jest.fn(),
    find: jest.fn(),
  };
  const messagesService: any = {
    createRoom: jest.fn(),
  };
  const gateway: any = {
    broadcast: jest.fn(),
  };

  const service = () => new MatchingAssistantService(
    opportunityModel,
    eventModel,
    messagesService,
    gateway
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a first suggestion message from ranked opportunities", async () => {
    opportunityModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: "opp-1",
              sourcePostId: "truck-1",
              candidatePostId: "load-1",
              tier: "hazmatPermission",
              score: 0.88,
              permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
            },
          ]),
        }),
      }),
    });
    eventModel.create.mockResolvedValue({ message: "No exact match. Option 1 needs permission." });

    const event = await service().createSourceSuggestion("carrier-company-1", "carrier-user-1", "truck-1");

    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "carrier-company-1",
      role: "assistant",
      relatedOpportunityId: "opp-1",
    }));
    expect(event.message).toContain("No exact");
  });

  it("asks the counterpart when the user chooses a permission opportunity", async () => {
    opportunityModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "opp-1",
        companyId: "carrier-company-1",
        sourcePostType: "carrierPost",
        sourcePostId: "truck-1",
        candidatePostType: "brokerPost",
        candidatePostId: "load-1",
        candidatePublisherId: "broker-user-1",
        permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
      }),
    });
    opportunityModel.findByIdAndUpdate.mockResolvedValue({});
    eventModel.create.mockResolvedValue({});

    await service().askCounterpart("opp-1", { _id: "carrier-user-1", role: "carrier", companyId: "carrier-company-1" });

    expect(opportunityModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "opp-1",
      expect.objectContaining({ permissionStatus: "asked", status: "negotiating" }),
      { new: true }
    );
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "broker-user-1",
      expect.objectContaining({ type: "matchingAssistantEvent" })
    );
  });
});
```

- [ ] **Step 2: Run assistant test and confirm it fails**

Run:

```powershell
npm test -- matching-assistant.service.spec.ts --runInBand
```

Expected: FAIL because assistant service files do not exist.

- [ ] **Step 3: Add assistant event interface and schema**

Create `prometheus-backend/src/matching/interface/matching-assistant-event.interface.ts`:

```ts
import { Document } from "mongoose";

export type MatchingAssistantEventRole = "assistant" | "user" | "system";

export interface MatchingAssistantCommand {
  command: string;
  label: string;
  opportunityId?: string;
}

export interface MatchingAssistantEvent extends Document {
  companyId: string;
  userId?: string;
  role: MatchingAssistantEventRole;
  message: string;
  relatedOpportunityId?: string;
  sourcePostId?: string;
  availableCommands: MatchingAssistantCommand[];
  createdAt?: Date;
  updatedAt?: Date;
}
```

Create `prometheus-backend/src/matching/schema/matching-assistant-event.schema.ts`:

```ts
import * as mongoose from "mongoose";
import { MatchingAssistantEvent } from "../interface/matching-assistant-event.interface";

const MatchingAssistantCommandSchema = new mongoose.Schema(
  {
    command: String,
    label: String,
    opportunityId: String,
  },
  { _id: false }
);

export const MatchingAssistantEventSchema = new mongoose.Schema<MatchingAssistantEvent>(
  {
    companyId: { type: String, index: true },
    userId: { type: String, index: true },
    role: { type: String, enum: ["assistant", "user", "system"], index: true },
    message: String,
    relatedOpportunityId: { type: String, index: true },
    sourcePostId: { type: String, index: true },
    availableCommands: [MatchingAssistantCommandSchema],
  },
  {
    timestamps: true,
    collection: "matchingassistantevents",
  }
);

MatchingAssistantEventSchema.index({ companyId: 1, createdAt: -1 });
MatchingAssistantEventSchema.index({ userId: 1, createdAt: -1 });
```

- [ ] **Step 4: Add assistant DTOs**

Create `prometheus-backend/src/matching/dto/matching-assistant.dto.ts`:

```ts
import { IsIn, IsOptional, IsString } from "class-validator";

export class MatchingAssistantCommandDTO {
  @IsString()
  readonly prompt: string;

  @IsOptional()
  @IsString()
  readonly sourcePostId?: string;
}

export class OpportunityActionDTO {
  @IsIn(["ask", "accept", "reject", "book"])
  readonly action: "ask" | "accept" | "reject" | "book";
}
```

- [ ] **Step 5: Implement assistant service**

Create `prometheus-backend/src/matching/matching-assistant.service.ts`:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AppGateway } from "src/gateway/app.gateway";
import { MessagesService } from "src/messages/messages.service";
import { MatchOpportunity } from "./interface/match-opportunity.interface";
import { MatchingAssistantEvent } from "./interface/matching-assistant-event.interface";

@Injectable()
export class MatchingAssistantService {
  constructor(
    @InjectModel("matchOpportunity") private readonly opportunityModel: Model<MatchOpportunity>,
    @InjectModel("matchingAssistantEvent") private readonly eventModel: Model<MatchingAssistantEvent>,
    private readonly messagesService: MessagesService,
    private readonly gateway: AppGateway
  ) {}

  async listEvents(user: any) {
    return this.eventModel
      .find({ companyId: String(user.companyId ?? "") })
      .sort({ createdAt: 1 })
      .lean<any>();
  }

  async createSourceSuggestion(companyId: string, userId: string, sourcePostId: string) {
    const opportunities = await this.opportunityModel
      .find({ companyId, sourcePostId, status: { $in: ["suggested", "negotiating"] } })
      .sort({ tierRank: 1, score: -1, updatedAt: -1 })
      .limit(5)
      .lean<any>();

    const best = opportunities[0];
    const message = this.renderSuggestion(opportunities);
    const event = await this.eventModel.create({
      companyId,
      userId,
      role: "assistant",
      sourcePostId,
      relatedOpportunityId: best?._id?.toString?.() ?? undefined,
      message,
      availableCommands: opportunities.slice(0, 3).map((opportunity, index) => ({
        command: `ask about ${index + 1}`,
        label: `Ask about option ${index + 1}`,
        opportunityId: opportunity._id?.toString?.() ?? String(opportunity._id),
      })),
    });

    this.gateway.broadcast(`${companyId}_${this.companyRoleRoomSuffix(best?.sourcePostType)}`, {
      type: "matchingAssistantEvent",
      data: event,
    });

    return event;
  }

  async askCounterpart(opportunityId: string, user: any) {
    const opportunity = await this.opportunityModel.findById(opportunityId).lean<any>();
    if (!opportunity) {
      throw new NotFoundException("Match opportunity was not found.");
    }

    await this.opportunityModel.findByIdAndUpdate(
      opportunityId,
      { permissionStatus: "asked", status: "negotiating" },
      { new: true }
    );

    const targetUserId = String(opportunity.candidatePublisherId ?? "");
    const message = opportunity.permissionQuestion || "Can this hazmat option work for your posting?";
    const event = await this.eventModel.create({
      companyId: String(opportunity.companyId),
      userId: targetUserId,
      role: "assistant",
      sourcePostId: opportunity.candidatePostId,
      relatedOpportunityId: opportunityId,
      message,
      availableCommands: [
        { command: "yes", label: "Accept fit", opportunityId },
        { command: "no", label: "Reject fit", opportunityId },
      ],
    });

    this.gateway.broadcast(targetUserId, {
      type: "matchingAssistantEvent",
      data: event,
    });

    return event;
  }

  async rejectOpportunity(opportunityId: string, user: any) {
    await this.opportunityModel.findByIdAndUpdate(
      opportunityId,
      { permissionStatus: "rejected", status: "rejected" },
      { new: true }
    );
    return this.eventModel.create({
      companyId: String(user.companyId ?? ""),
      userId: String(user._id ?? ""),
      role: "assistant",
      relatedOpportunityId: opportunityId,
      message: "That option was rejected. Prometheus will suggest the next hazmat option if one is available.",
      availableCommands: [{ command: "show next", label: "Show next option" }],
    });
  }

  async createBookingRoom(opportunityId: string, user: any) {
    const opportunity = await this.opportunityModel.findById(opportunityId).lean<any>();
    if (!opportunity) {
      throw new NotFoundException("Match opportunity was not found.");
    }

    const sourceIsBroker = opportunity.sourcePostType === "brokerPost";
    const room = await this.messagesService.createRoom(
      {
        myPostId: sourceIsBroker ? opportunity.sourcePostId : opportunity.candidatePostId,
        otherPostId: sourceIsBroker ? opportunity.candidatePostId : opportunity.sourcePostId,
        otherUserId: opportunity.candidatePublisherId,
      },
      user._id,
      user.role
    );

    await this.opportunityModel.findByIdAndUpdate(
      opportunityId,
      { status: "approvedForBooking" },
      { new: true }
    );

    return room;
  }

  private renderSuggestion(opportunities: any[]): string {
    if (!opportunities.length) {
      return "No useful hazmat option is available yet. Prometheus will keep watching as new loads and trucks appear.";
    }
    const best = opportunities[0];
    if (best.tier === "hazmatPermission") {
      return `No exact hazmat match is available. Option 1 may work with permission: ${best.permissionQuestion} Type "ask about 1" if you want me to ask.`;
    }
    return `I found ${opportunities.length} hazmat option${opportunities.length === 1 ? "" : "s"}. Option 1 is the strongest fit. Type "ask about 1", "show next", or "book option 1".`;
  }

  private companyRoleRoomSuffix(sourcePostType?: string): string {
    return sourcePostType === "brokerPost" ? "broker" : "carrier";
  }
}
```

- [ ] **Step 6: Register assistant schema and provider**

In `prometheus-backend/src/matching/matching.module.ts`, import:

```ts
import { MessagesModule } from "src/messages/messages.module";
import { AppGatewayModule } from "src/gateway/app.gateway.module";
import { MatchingAssistantService } from "./matching-assistant.service";
import { MatchingAssistantEventSchema } from "./schema/matching-assistant-event.schema";
```

Add model:

```ts
{ name: "matchingAssistantEvent", schema: MatchingAssistantEventSchema },
```

Add module imports:

```ts
MessagesModule,
AppGatewayModule,
```

Add provider and export:

```ts
providers: [MatchingService, MatchingAssistantService],
exports: [MatchingService, MatchingAssistantService],
```

- [ ] **Step 7: Add controller endpoints**

In `prometheus-backend/src/matching/matching.controller.ts`, import:

```ts
import { Patch } from "@nestjs/common";
import { MatchingAssistantCommandDTO, OpportunityActionDTO } from "./dto/matching-assistant.dto";
import { MatchingAssistantService } from "./matching-assistant.service";
```

Update constructor:

```ts
constructor(
  private readonly service: MatchingService,
  private readonly assistant: MatchingAssistantService
) {}
```

Add endpoints:

```ts
@Roles("broker", "carrier", "admin", "manager", "supervisor")
@Get("assistant/events")
@ApiOkResponse({ status: 200 })
listAssistantEvents(@Req() req) {
  return this.assistant.listEvents(req.user);
}

@Roles("broker", "carrier", "admin", "manager", "supervisor")
@Post("assistant/command")
@ApiOkResponse({ status: 200 })
handleAssistantCommand(@Body() data: MatchingAssistantCommandDTO, @Req() req) {
  return this.assistant.handleCommand(data.prompt, req.user, data.sourcePostId);
}

@Roles("broker", "carrier", "admin", "manager", "supervisor")
@Patch("opportunities/:id/action")
@ApiOkResponse({ status: 200 })
handleOpportunityAction(
  @Param("id") id: string,
  @Body() data: OpportunityActionDTO,
  @Req() req
) {
  if (data.action === "ask") return this.assistant.askCounterpart(id, req.user);
  if (data.action === "reject") return this.assistant.rejectOpportunity(id, req.user);
  if (data.action === "book") return this.assistant.createBookingRoom(id, req.user);
  return this.assistant.rejectOpportunity(id, req.user);
}
```

Add `handleCommand` to `MatchingAssistantService`:

```ts
async handleCommand(prompt: string, user: any, sourcePostId?: string) {
  const normalized = String(prompt ?? "").trim().toLowerCase();
  const indexMatch = normalized.match(/(?:ask about|ask|book option|book match|book)\s+(\d+)/);
  if (indexMatch && sourcePostId) {
    const index = Number(indexMatch[1]) - 1;
    const opportunities = await this.opportunityModel
      .find({ companyId: String(user.companyId ?? ""), sourcePostId, status: { $in: ["suggested", "negotiating"] } })
      .sort({ tierRank: 1, score: -1, updatedAt: -1 })
      .limit(5)
      .lean<any>();
    const opportunity = opportunities[index];
    if (!opportunity) {
      return this.eventModel.create({
        companyId: String(user.companyId ?? ""),
        userId: String(user._id ?? ""),
        role: "assistant",
        sourcePostId,
        message: "That option number is not available. Type show matches to see the current options.",
        availableCommands: [{ command: "show matches", label: "Show matches" }],
      });
    }
    if (normalized.includes("book")) {
      return this.createBookingRoom(String(opportunity._id), user);
    }
    return this.askCounterpart(String(opportunity._id), user);
  }
  return this.createSourceSuggestion(String(user.companyId ?? ""), String(user._id ?? ""), String(sourcePostId ?? ""));
}
```

- [ ] **Step 8: Run assistant tests**

Run:

```powershell
npm test -- matching-assistant.service.spec.ts matching.controller.spec.ts --runInBand
```

Expected: PASS after updating controller spec constructor mocks.

- [ ] **Step 9: Commit Task 3**

Run:

```powershell
git add prometheus-backend/src/matching
git commit -m "feat: add matching assistant commands"
```

---

### Task 4: Trigger Assistant Matching From Broker And Carrier Posts

**Files:**
- Modify: `prometheus-backend/src/post-broker/post.module.ts`
- Modify: `prometheus-backend/src/post-broker/post.service.ts`
- Modify: `prometheus-backend/src/post-carrier/post.module.ts`
- Modify: `prometheus-backend/src/post-carrier/post.service.ts`
- Modify: `prometheus-backend/src/matching/matching.module.ts`
- Modify: `prometheus-backend/src/matching/matching.service.ts`

- [ ] **Step 1: Add service methods for background assistant triggers**

In `prometheus-backend/src/matching/matching.service.ts`, import:

```ts
import { MatchingAssistantService } from "./matching-assistant.service";
```

Add constructor parameter after `routingService`:

```ts
private readonly assistantService: MatchingAssistantService
```

Add this method and keep it safe for background calls:

```ts
async createAssistantSuggestionForPost(
  sourcePostType: MatchSourcePostType,
  sourcePostId: string,
  userId: string
) {
  const snapshot = sourcePostType === "brokerPost"
    ? await this.createSnapshotForBrokerPost(sourcePostId, userId)
    : await this.createSnapshotForCarrierPost(sourcePostId, userId);
  await this.assistantService.createSourceSuggestion(
    snapshot.companyId,
    userId,
    sourcePostId
  );
  return snapshot;
}
```

Do not throw this call into post creation response paths without `catch`.

- [ ] **Step 2: Wire module forward refs**

In `prometheus-backend/src/matching/matching.module.ts`, import `forwardRef`:

```ts
import { forwardRef, Module } from "@nestjs/common";
```

Wrap post imports:

```ts
forwardRef(() => PostBrokerModule),
forwardRef(() => PostCarrierModule),
```

In `prometheus-backend/src/post-broker/post.module.ts`, import `MatchingModule`:

```ts
import { MatchingModule } from "src/matching/matching.module";
```

Add:

```ts
forwardRef(() => MatchingModule),
```

In `prometheus-backend/src/post-carrier/post.module.ts`, add the same `MatchingModule` import and `forwardRef(() => MatchingModule)`.

- [ ] **Step 3: Inject MatchingService into post services**

In both post services, import:

```ts
import { MatchingService } from "src/matching/matching.service";
```

Add constructor parameter:

```ts
@Inject(forwardRef(() => MatchingService))
private readonly matchingService: MatchingService,
```

- [ ] **Step 4: Trigger matching after broker post create**

In `prometheus-backend/src/post-broker/post.service.ts`, after `postToReturn.capacitySearch = 'both'`, before `return postToReturn`, add:

```ts
void this.matchingService
  .createAssistantSuggestionForPost("brokerPost", String((post as any)._id), String(userId))
  .catch((error) => console.error("[HazmatHero] Broker post assistant match failed", error?.message ?? error));
```

- [ ] **Step 5: Trigger matching after carrier post create**

In `prometheus-backend/src/post-carrier/post.service.ts`, after `postToReturn.capacitySearch = 'both';`, before `return postToReturn`, add:

```ts
void this.matchingService
  .createAssistantSuggestionForPost("carrierPost", String((post as any)._id), String(userId))
  .catch((error) => console.error("[HazmatHero] Carrier post assistant match failed", error?.message ?? error));
```

- [ ] **Step 6: Trigger matching on edit/update time**

In both post services, after edit and update-time success paths, call `createAssistantSuggestionForPost` with the saved post id. Use `void ...catch(...)` so posting stays responsive if matching has a routing or data problem.

- [ ] **Step 7: Run backend build**

Run:

```powershell
npm run build
```

Expected: PASS. If Nest reports a circular dependency, convert the affected service injection to `ModuleRef` lookup inside `onModuleInit` and keep the post response path unchanged.

- [ ] **Step 8: Commit Task 4**

Run:

```powershell
git add prometheus-backend/src/post-broker prometheus-backend/src/post-carrier prometheus-backend/src/matching
git commit -m "feat: trigger hazmat assistant from posts"
```

---

### Task 5: Add Frontend Models, API Methods, And Socket Listener

**Files:**
- Modify: `prometheus/package.json`
- Create: `prometheus/src/app/core/realtime/prometheus-socket.service.ts`
- Modify: `prometheus/src/app/shared/types/models.ts`
- Modify: `prometheus/src/app/core/api/matching-api.service.ts`

- [ ] **Step 1: Install Socket.IO client**

Run:

```powershell
npm install socket.io-client@4.8.1
```

Expected: `prometheus/package.json` and `prometheus/package-lock.json` update.

- [ ] **Step 2: Add frontend types**

In `prometheus/src/app/shared/types/models.ts`, add:

```ts
export type MatchOpportunityTier =
  | 'strictHazmat'
  | 'hazmatNearMatch'
  | 'hazmatPermission'
  | 'hazmatMarketAlternative'
  | 'nonHazmatFallback';

export type EquipmentCompatibility =
  | 'exact'
  | 'compatible'
  | 'requiresPermission'
  | 'incompatible';

export type PermissionStatus =
  | 'notNeeded'
  | 'notAsked'
  | 'asked'
  | 'accepted'
  | 'rejected'
  | 'expired';

export interface MatchingAssistantCommand {
  command: string;
  label: string;
  opportunityId?: string;
}

export interface MatchingAssistantEvent {
  _id?: string;
  companyId: string;
  userId?: string;
  role: 'assistant' | 'user' | 'system';
  message: string;
  relatedOpportunityId?: string;
  sourcePostId?: string;
  availableCommands: MatchingAssistantCommand[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OpportunityActionPayload {
  action: 'ask' | 'accept' | 'reject' | 'book';
}
```

Extend `MatchCandidate` with:

```ts
  tier?: MatchOpportunityTier;
  hazmatCompatible?: boolean;
  equipmentCompatibility?: EquipmentCompatibility;
  permissionStatus?: PermissionStatus;
  permissionQuestion?: string;
  reasonCodes?: string[];
```

- [ ] **Step 3: Add matching API methods**

In `prometheus/src/app/core/api/matching-api.service.ts`, import the new types and add:

```ts
  listAssistantEvents(): Observable<MatchingAssistantEvent[]> {
    return this.http.get<MatchingAssistantEvent[]>('matching/assistant/events');
  }

  sendAssistantCommand(payload: { prompt: string; sourcePostId?: string }): Observable<MatchingAssistantEvent | CreateDirectRoomResponse> {
    return this.http.post<MatchingAssistantEvent | CreateDirectRoomResponse>('matching/assistant/command', payload);
  }

  updateOpportunityAction(opportunityId: string, payload: OpportunityActionPayload): Observable<MatchingAssistantEvent | CreateDirectRoomResponse> {
    return this.http.patch<MatchingAssistantEvent | CreateDirectRoomResponse>(`matching/opportunities/${opportunityId}/action`, payload);
  }
```

- [ ] **Step 4: Create socket service**

Create `prometheus/src/app/core/realtime/prometheus-socket.service.ts`:

```ts
import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthSessionService } from '../auth/auth-session.service';

export interface PrometheusSocketEvent {
  type: string;
  data: unknown;
}

@Injectable({ providedIn: 'root' })
export class PrometheusSocketService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly notifySubject = new Subject<PrometheusSocketEvent>();

  readonly notify$: Observable<PrometheusSocketEvent> = this.notifySubject.asObservable();

  constructor(private readonly session: AuthSessionService) {}

  connect(): void {
    if (this.socket?.connected || !this.session.token) return;
    const endpoint = environment.apiBaseUrl.replace(/\/$/, '');
    this.socket = io(endpoint, {
      transports: ['websocket', 'polling'],
      auth: {
        token: `Bearer ${this.session.token}`,
      },
    });
    this.socket.on('notify', (event: PrometheusSocketEvent) => this.notifySubject.next(event));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.notifySubject.complete();
  }
}
```

- [ ] **Step 5: Run frontend tests for type failures**

Run:

```powershell
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected after workspace wiring is still pending: PASS. If this fails, stop this task and inspect the TypeScript error output before editing any workspace component files.

- [ ] **Step 6: Commit Task 5**

Run:

```powershell
git add prometheus/package.json prometheus/package-lock.json prometheus/src/app/shared/types/models.ts prometheus/src/app/core/api/matching-api.service.ts prometheus/src/app/core/realtime/prometheus-socket.service.ts
git commit -m "feat: add matching assistant frontend api"
```

---

### Task 6: Wire The Conversation-First Matching Console

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts`

- [ ] **Step 1: Add workspace tests for assistant events and guided commands**

Append these tests to `prometheus/src/app/features/workspace/workspace.component.spec.ts`:

```ts
  it('appends backend assistant events as matching chat messages', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');

    (component as any).handleMatchingAssistantEvent({
      role: 'assistant',
      message: 'No exact RZ match. Option 1 may work if broker accepts reefer.',
      availableCommands: [{ command: 'ask about 1', label: 'Ask about option 1', opportunityId: 'opp-1' }],
      createdAt: new Date().toISOString(),
    });

    const message = component.matchingConsoleMessages.at(-1)?.text ?? '';
    expect(message).toContain('No exact RZ match');
    expect(message).toContain('ask about 1');
  });

  it('sends ask about commands to the matching assistant instead of opening a room immediately', () => {
    const matchingApi = {
      sendAssistantCommand: jasmine.createSpy('sendAssistantCommand').and.returnValue(of({
        role: 'assistant',
        message: 'I asked the broker if reefer equipment is accepted.',
        availableCommands: [],
      })),
    };
    const component = createComponent({ matchingApi });
    component.user = userWithRole('carrier');
    component.selectedPostId = 'truck-1';
    component.chatbbPrompt = 'ask about 1';

    component.submitMatchingConsole();

    expect(matchingApi.sendAssistantCommand).toHaveBeenCalledWith({
      prompt: 'ask about 1',
      sourcePostId: 'truck-1',
    });
    expect(component.matchingConsoleMessages.at(-1)?.text).toContain('I asked the broker');
  });
```

- [ ] **Step 2: Inject socket service**

In `workspace.component.ts`, import:

```ts
import { PrometheusSocketService } from '../../core/realtime/prometheus-socket.service';
import { MatchingAssistantEvent } from '../../shared/types/models';
```

Add constructor parameter after `router`:

```ts
private readonly socket: PrometheusSocketService
```

Update `createComponent` test helper to pass `overrides['socket'] ?? {} as any`.

- [ ] **Step 3: Connect and consume backend events**

In `ngOnInit`, after user is established and before `loadWorkspaceData`, call:

```ts
this.socket.connect();
this.socket.notify$.subscribe((event) => {
  if (event.type === 'matchingAssistantEvent') {
    this.handleMatchingAssistantEvent(event.data as MatchingAssistantEvent);
  }
});
```

Add method:

```ts
private handleMatchingAssistantEvent(event: MatchingAssistantEvent): void {
  const commands = (event.availableCommands ?? []).map((command) => command.command).join(' | ');
  const commandLine = commands ? `\nCommands: ${commands}` : '';
  this.appendMatchingBubble('assistant', `${event.message}${commandLine}`, 'Prometheus');
}
```

- [ ] **Step 4: Load persisted assistant events on workspace load**

In `loadWorkspaceData`, add `assistantEvents` to `forkJoin`:

```ts
assistantEvents: this.matchingApi.listAssistantEvents().pipe(catchError(() => of([] as MatchingAssistantEvent[]))),
```

In the success block, after console priming:

```ts
result.assistantEvents.forEach((event) => this.handleMatchingAssistantEvent(event));
```

Guard against duplicates by adding a private set:

```ts
private readonly seenAssistantEventIds = new Set<string>();
```

and at the top of `handleMatchingAssistantEvent`:

```ts
const eventId = event._id ?? `${event.createdAt}-${event.message}`;
if (this.seenAssistantEventIds.has(eventId)) return;
this.seenAssistantEventIds.add(eventId);
```

- [ ] **Step 5: Route matching console commands to backend assistant**

In `handleMatchingConsoleCommand`, before `isMatchListCommand`, add:

```ts
if (this.isHazmatAssistantCommand(normalized)) {
  this.appendMatchingBubble('user', prompt, 'You');
  this.sendMatchingAssistantCommand(prompt);
  return true;
}
```

Add helpers:

```ts
private isHazmatAssistantCommand(prompt: string): boolean {
  return /(?:ask about|ask|book option|book match|skip|show next|offer)\s*/.test(prompt);
}

private sendMatchingAssistantCommand(prompt: string): void {
  this.matchingApi.sendAssistantCommand({
    prompt,
    sourcePostId: this.selectedPostId || undefined,
  }).subscribe({
    next: (response: any) => {
      if (response?.room) {
        this.appendMatchingBubble('assistant', 'The booking conversation is ready. Open Booking Chat to approve or reject the booking.', 'Prometheus');
        this.activeTab = 'direct';
        this.activeDirectConsoleView = 'booking';
        if (this.selectedPost) this.loadRooms(this.selectedPost, response.room.carrierPostId ?? response.room.brokerPostId ?? '');
        return;
      }
      this.handleMatchingAssistantEvent(response as MatchingAssistantEvent);
    },
    error: () => this.appendMatchingBubble('assistant', 'Prometheus could not process that assistant command right now.', 'Prometheus'),
  });
}
```

- [ ] **Step 6: Update AI matching component for event-style messages**

In `ai-matching-console.component.ts`, extend `ConsoleBubble`:

```ts
  createdAt?: string | null;
```

In `ai-matching-console.component.html`, change the meta span for matching bubbles to:

```html
<span *ngIf="bubble.createdAt; else plainConsoleType">{{ formatTimestamp(bubble.createdAt) }}</span>
<ng-template #plainConsoleType>{{ bubble.sender === 'assistant' ? 'console command' : 'console input' }}</ng-template>
```

Keep the surface chat-only. Do not add match cards or columns.

- [ ] **Step 7: Run frontend tests**

Run:

```powershell
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

Run:

```powershell
git add prometheus/src/app
git commit -m "feat: wire hazmat assistant console"
```

---

### Task 7: End-To-End Verification

**Files:**
- Modify only if tests reveal a defect.

- [ ] **Step 1: Run backend unit tests**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run frontend tests**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus
npm run build
```

Expected: PASS with only the existing Angular budget warnings.

- [ ] **Step 5: Manual smoke test**

Run backend and frontend, then test this flow:

```text
1. Sign in as carrier.
2. Post: "Truck in Pittsburgh PA ready now RZ reefer hazmat wants Chicago 44000 max."
3. Sign in as broker in another browser.
4. Post or import: "VZ hazmat load Pittsburgh PA to Chicago IL 40000 lbs 2800."
5. Carrier Matching Console receives an assistant message without pressing Refresh.
6. Carrier types "ask about 1".
7. Broker Matching Console receives the reefer permission question.
8. Broker replies yes.
9. Carrier types "book option 1".
10. Booking Chat opens with approve/reject flow.
11. No load record is created until both sides approve.
```

Expected: each step succeeds. If a live socket event is delayed, verify the event appears after a workspace refresh, then inspect `PrometheusSocketService.connect()` and the backend `gateway.broadcast(...)` payload before marking the task complete.

- [ ] **Step 6: Commit final fixes**

If any verification change was needed:

```powershell
git add prometheus-backend prometheus
git commit -m "fix: verify hazmat assistant flow"
```

If no changes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: Tasks 1 and 2 cover hazmat-first tiering, equipment substitution, and near-match facts. Task 3 covers guided assistant commands and permission questions. Task 4 covers automatic post-triggered matching. Tasks 5 and 6 cover frontend real-time conversation flow. Task 7 covers both automated and manual verification.
- Scope control: Stripe, DigitalOcean, real ELD, real Highway/MyCarrierPackets, and full market-rate intelligence are not included in this implementation plan.
- Type consistency: Backend tier names match frontend tier names: `strictHazmat`, `hazmatNearMatch`, `hazmatPermission`, `hazmatMarketAlternative`, `nonHazmatFallback`.
- Safety: No data-changing booking action bypasses the existing booking approval state. `book option 1` opens or creates the room; both sides still need approval before `LoadsService.createFromRoom` can create the load.
