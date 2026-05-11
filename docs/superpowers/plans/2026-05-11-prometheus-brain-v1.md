# Prometheus Brain V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped Prometheus Brain foundation: one role-aware hazmat transportation assistant that can answer operational prompts, search loads and trucks through existing matching logic, suggest safe alternatives, create approval requests before responsibility-changing actions, and keep a written company audit trail with opt-in memory.
**Architecture:** Add a backend `BrainModule` that wraps existing matching services with Brain events, approval requests, memory settings, and safe deterministic intent handling. Add Angular API/types and route the AI Matching Console prompt through Brain while preserving the current posting, matching, booking, direct chat, company setup, and load console layouts.
**Tech Stack:** NestJS, Mongoose, Jest, Angular, RxJS, Jasmine/Karma, current JWT role guards, current MongoDB collections, existing `AgentCommandService`, existing workspace UI.

---

## Scope

This plan implements Brain V1 foundation only.

Included:

- Brain prompt endpoint for carrier, broker, admin, manager, and supervisor users.
- Deterministic intent classification for search, map request, nearby service draft, hazmat question, email/chat draft, booking approval draft, and save-memory request.
- Reuse of existing hazmat load/truck search in `AgentCommandService`.
- Persisted Brain event log.
- Persisted approval request log.
- Company memory settings and opt-in memory records.
- Frontend prompt routing from the AI Matching Console to Brain.
- Frontend display for Brain answers and approval prompts.
- Tests for backend services, controller behavior, and matching console behavior.

Not included in this implementation pass:

- Real external email sending.
- Real Google Maps, MacroPoint, FourKites, TQL, ELD, TMS, or CH Robinson API calls.
- Cloud OpenAI model routing.
- Automated legal/hazmat regulatory determination without human review.

Those provider integrations stay behind the approval/tool boundary created here.

## Current Code Anchors

- Backend search brain already exists in `C:\Prometheus-Clean\prometheus-backend\src\matching\agent-command.service.ts`.
- Prompt parsing lives in `C:\Prometheus-Clean\prometheus-backend\src\matching\agent-command-parser.ts`.
- Matching API controller lives in `C:\Prometheus-Clean\prometheus-backend\src\matching\matching.controller.ts`.
- Backend root module lives in `C:\Prometheus-Clean\prometheus-backend\src\app.module.ts`.
- Company schema lives in `C:\Prometheus-Clean\prometheus-backend\src\company\schema\company.schema.ts`.
- Workspace UI lives in `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.ts`.
- Frontend matching API lives in `C:\Prometheus-Clean\prometheus\src\app\core\api\matching-api.service.ts`.
- Shared Angular models live in `C:\Prometheus-Clean\prometheus\src\app\shared\types\models.ts`.

## Data Model

### Brain Event

Collection name: `prometheusBrainEvent`

Fields:

- `companyId: string`
- `userId: string`
- `role: string`
- `source: "matching" | "booking" | "direct" | "company" | "loads" | "admin"`
- `type: "promptReceived" | "intentClassified" | "toolExecuted" | "suggestionShown" | "approvalRequested" | "approvalAccepted" | "approvalRejected" | "actionExecuted" | "memoryRequested" | "memorySaved" | "memoryDeleted" | "error"`
- `prompt?: string`
- `message?: string`
- `intent?: string`
- `tool?: string`
- `related?: Record<string, string>`
- `payload?: Record<string, unknown>`
- `createdAt` and `updatedAt` from Mongoose timestamps

### Brain Approval Request

Collection name: `prometheusBrainApproval`

Fields:

- `companyId: string`
- `requestedBy: string`
- `decidedBy?: string`
- `role: string`
- `actionType: "sendEmail" | "sendChat" | "placeBid" | "sendCounter" | "startBookingApproval" | "confirmBooking" | "cancelLoad" | "requestTracking" | "assignDriver" | "markDelivered" | "moveLoadState" | "saveMemory" | "changeCompanyAccess" | "providerPending"`
- `label: string`
- `summary: string`
- `riskNote: string`
- `payload: Record<string, unknown>`
- `status: "pending" | "approved" | "rejected" | "expired" | "executed" | "failed"`
- `expiresAt?: Date`
- `decisionAt?: Date`
- `result?: Record<string, unknown>`
- `createdAt` and `updatedAt`

### Brain Memory

Collection name: `prometheusBrainMemory`

Fields:

- `companyId: string`
- `createdBy: string`
- `approvedBy: string`
- `scope: "company" | "driver" | "broker" | "lane" | "customer" | "user"`
- `subjectKey: string`
- `subjectLabel: string`
- `content: string`
- `tags: string[]`
- `sourceApprovalId: string`
- `active: boolean`
- `createdAt` and `updatedAt`

### Company Brain Settings

Add to `CompanySchema`:

```ts
brainSettings: {
  memoryMode: {
    type: String,
    enum: ["off", "companyManaged", "prometheusManaged"],
    default: "off"
  },
  auditRetentionDays: {
    type: Number,
    default: 365
  },
  allowProviderTools: {
    type: Boolean,
    default: false
  },
  updatedBy: String,
  updatedAt: Date
}
```

## API Shape

### POST `/brain/prompt`

Request:

```ts
export interface PrometheusBrainPromptRequest {
  prompt: string;
  source: "matching" | "booking" | "direct" | "company" | "loads" | "admin";
  related?: {
    sourcePostId?: string;
    sourcePostType?: "brokerPost" | "carrierPost";
    roomId?: string;
    loadId?: string;
    companyId?: string;
  };
}
```

Response:

```ts
export interface PrometheusBrainPromptResponse {
  answer: string;
  handled: boolean;
  intent: string;
  eventId?: string;
  approval?: PrometheusBrainApproval;
  metadata?: Record<string, unknown>;
}
```

### GET `/brain/events`

Returns the current user's company Brain events, newest first, limit 100.

### GET `/brain/approvals`

Returns pending and recent approval requests for the current user's company.

### PATCH `/brain/approvals/:approvalId/approve`

Approves and executes only supported V1 internal actions. External-provider actions are marked approved with `providerPending` result until provider integrations are added.

### PATCH `/brain/approvals/:approvalId/reject`

Rejects the approval and records the written trail.

### GET `/brain/memory`

Returns active company memory records when memory mode is not `off`.

### PATCH `/brain/settings`

Admin, supervisor, or superadmin endpoint to update memory mode, audit retention, and provider tool allowance.

## Task 1 - Backend Brain Event Log

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\interface\prometheus-brain-event.interface.ts`.

```ts
export type PrometheusBrainEventType =
  | "promptReceived"
  | "intentClassified"
  | "toolExecuted"
  | "suggestionShown"
  | "approvalRequested"
  | "approvalAccepted"
  | "approvalRejected"
  | "actionExecuted"
  | "memoryRequested"
  | "memorySaved"
  | "memoryDeleted"
  | "error";

export type PrometheusBrainSource =
  | "matching"
  | "booking"
  | "direct"
  | "company"
  | "loads"
  | "admin";

export interface PrometheusBrainEvent {
  companyId: string;
  userId: string;
  role: string;
  source: PrometheusBrainSource;
  type: PrometheusBrainEventType;
  prompt?: string;
  message?: string;
  intent?: string;
  tool?: string;
  related?: Record<string, string>;
  payload?: Record<string, unknown>;
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\schema\prometheus-brain-event.schema.ts`.

```ts
import * as mongoose from "mongoose";

export const PrometheusBrainEventSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true },
    source: {
      type: String,
      enum: ["matching", "booking", "direct", "company", "loads", "admin"],
      required: true,
    },
    type: {
      type: String,
      enum: [
        "promptReceived",
        "intentClassified",
        "toolExecuted",
        "suggestionShown",
        "approvalRequested",
        "approvalAccepted",
        "approvalRejected",
        "actionExecuted",
        "memoryRequested",
        "memorySaved",
        "memoryDeleted",
        "error",
      ],
      required: true,
      index: true,
    },
    prompt: String,
    message: String,
    intent: String,
    tool: String,
    related: Object,
    payload: Object,
  },
  { timestamps: true }
);

PrometheusBrainEventSchema.index({ companyId: 1, createdAt: -1 });
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\brain-event.service.ts`.

```ts
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PrometheusBrainEvent } from "./interface/prometheus-brain-event.interface";

@Injectable()
export class BrainEventService {
  constructor(
    @InjectModel("prometheusBrainEvent")
    private readonly eventModel: Model<any>
  ) {}

  async record(event: PrometheusBrainEvent) {
    return this.eventModel.create(event);
  }

  async listForCompany(companyId: string, limit = 100) {
    return this.eventModel
      .find({ companyId: String(companyId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<any[]>();
  }
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\brain-event.service.spec.ts` with tests:

```ts
it("records a prompt event with company and user context", async () => {
  const model = { create: jest.fn().mockResolvedValue({ _id: "evt1" }) };
  const service = new BrainEventService(model as any);

  await service.record({
    companyId: "co1",
    userId: "user1",
    role: "carrier",
    source: "matching",
    type: "promptReceived",
    prompt: "anything out of Memphis?",
  });

  expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
    companyId: "co1",
    source: "matching",
    type: "promptReceived",
  }));
});
```

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- brain-event.service.spec.ts
```

Expected output: event service tests pass.

## Task 2 - Backend Approval Requests

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\interface\prometheus-brain-approval.interface.ts`.

```ts
export type PrometheusBrainApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "failed";

export type PrometheusBrainActionType =
  | "sendEmail"
  | "sendChat"
  | "placeBid"
  | "sendCounter"
  | "startBookingApproval"
  | "confirmBooking"
  | "cancelLoad"
  | "requestTracking"
  | "assignDriver"
  | "markDelivered"
  | "moveLoadState"
  | "saveMemory"
  | "changeCompanyAccess"
  | "providerPending";

export interface PrometheusBrainApproval {
  _id?: string;
  companyId: string;
  requestedBy: string;
  decidedBy?: string;
  role: string;
  actionType: PrometheusBrainActionType;
  label: string;
  summary: string;
  riskNote: string;
  payload: Record<string, unknown>;
  status: PrometheusBrainApprovalStatus;
  expiresAt?: Date;
  decisionAt?: Date;
  result?: Record<string, unknown>;
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\schema\prometheus-brain-approval.schema.ts`.

```ts
import * as mongoose from "mongoose";

export const PrometheusBrainApprovalSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    requestedBy: { type: String, required: true },
    decidedBy: String,
    role: { type: String, required: true },
    actionType: {
      type: String,
      enum: [
        "sendEmail",
        "sendChat",
        "placeBid",
        "sendCounter",
        "startBookingApproval",
        "confirmBooking",
        "cancelLoad",
        "requestTracking",
        "assignDriver",
        "markDelivered",
        "moveLoadState",
        "saveMemory",
        "changeCompanyAccess",
        "providerPending",
      ],
      required: true,
    },
    label: { type: String, required: true },
    summary: { type: String, required: true },
    riskNote: { type: String, required: true },
    payload: { type: Object, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired", "executed", "failed"],
      default: "pending",
      index: true,
    },
    expiresAt: Date,
    decisionAt: Date,
    result: Object,
  },
  { timestamps: true }
);

PrometheusBrainApprovalSchema.index({ companyId: 1, status: 1, createdAt: -1 });
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\brain-approval.service.ts`.

Core behavior:

```ts
async createRequest(input: Omit<PrometheusBrainApproval, "status">) {
  const approval = await this.approvalModel.create(
    Object.assign({}, input, { status: "pending" })
  );
  await this.events.record({
    companyId: input.companyId,
    userId: input.requestedBy,
    role: input.role,
    source: "matching",
    type: "approvalRequested",
    intent: input.actionType,
    message: input.summary,
    payload: input.payload,
  });
  return approval;
}

async reject(approvalId: string, user: any) {
  const approval = await this.findCompanyApproval(approvalId, user);
  if (approval.status !== "pending") {
    throw new BadRequestException("This approval is not pending.");
  }
  const updated = await this.approvalModel
    .findByIdAndUpdate(
      approvalId,
      { status: "rejected", decidedBy: String(user._id), decisionAt: new Date() },
      { new: true }
    )
    .lean<any>();
  await this.events.record({
    companyId: String(user.companyId),
    userId: String(user._id),
    role: String(user.role),
    source: "matching",
    type: "approvalRejected",
    intent: approval.actionType,
    message: approval.summary,
    payload: approval.payload,
  });
  return updated;
}
```

- [ ] Add tests in `C:\Prometheus-Clean\prometheus-backend\src\brain\brain-approval.service.spec.ts`:

Test cases:

- Creates pending approval and audit event.
- Rejects only pending approval.
- Blocks approval lookup when `companyId` does not match the current user.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- brain-approval.service.spec.ts
```

Expected output: approval service tests pass.

## Task 3 - Company Brain Settings and Memory

- [ ] Patch `C:\Prometheus-Clean\prometheus-backend\src\company\schema\company.schema.ts` to add `brainSettings`.

Insert before `deletedAt`:

```ts
    brainSettings: {
      memoryMode: {
        type: String,
        enum: ["off", "companyManaged", "prometheusManaged"],
        default: "off"
      },
      auditRetentionDays: {
        type: Number,
        default: 365
      },
      allowProviderTools: {
        type: Boolean,
        default: false
      },
      updatedBy: String,
      updatedAt: Date
    },
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\brain-settings.util.ts`.

```ts
export type BrainMemoryMode = "off" | "companyManaged" | "prometheusManaged";

export interface BrainSettings {
  memoryMode: BrainMemoryMode;
  auditRetentionDays: number;
  allowProviderTools: boolean;
}

export const DEFAULT_BRAIN_SETTINGS: BrainSettings = {
  memoryMode: "off",
  auditRetentionDays: 365,
  allowProviderTools: false,
};

export function normalizeBrainSettings(value: any): BrainSettings {
  return {
    memoryMode: ["off", "companyManaged", "prometheusManaged"].includes(value?.memoryMode)
      ? value.memoryMode
      : DEFAULT_BRAIN_SETTINGS.memoryMode,
    auditRetentionDays: Number.isFinite(Number(value?.auditRetentionDays))
      ? Number(value.auditRetentionDays)
      : DEFAULT_BRAIN_SETTINGS.auditRetentionDays,
    allowProviderTools: Boolean(value?.allowProviderTools),
  };
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\schema\prometheus-brain-memory.schema.ts`.

```ts
import * as mongoose from "mongoose";

export const PrometheusBrainMemorySchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    approvedBy: { type: String, required: true },
    scope: {
      type: String,
      enum: ["company", "driver", "broker", "lane", "customer", "user"],
      required: true,
      index: true,
    },
    subjectKey: { type: String, required: true, index: true },
    subjectLabel: { type: String, required: true },
    content: { type: String, required: true },
    tags: [String],
    sourceApprovalId: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

PrometheusBrainMemorySchema.index({ companyId: 1, scope: 1, subjectKey: 1, active: 1 });
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\brain-memory.service.ts`.

Core behavior:

```ts
async getCompanySettings(companyId: string) {
  const company = await this.companyModel.findById(companyId).lean<any>();
  return normalizeBrainSettings(company?.brainSettings);
}

async requestSaveMemory(input: {
  companyId: string;
  userId: string;
  role: string;
  content: string;
  scope: string;
  subjectKey: string;
  subjectLabel: string;
  tags?: string[];
}) {
  const settings = await this.getCompanySettings(input.companyId);
  if (settings.memoryMode === "off") {
    return {
      blocked: true,
      message: "Company memory is off. I can use this in the current conversation, but I will not save it.",
    };
  }
  return this.approvals.createRequest({
    companyId: input.companyId,
    requestedBy: input.userId,
    role: input.role,
    actionType: "saveMemory",
    label: "Save company memory",
    summary: `Approve saving this Prometheus memory: ${input.content}`,
    riskNote: "Saved memory may influence future dispatch and broker suggestions for this company.",
    payload: input,
  });
}
```

- [ ] Add tests in `C:\Prometheus-Clean\prometheus-backend\src\brain\brain-memory.service.spec.ts`:

Test cases:

- Memory mode `off` returns a blocked message and does not create approval.
- Memory mode `companyManaged` creates approval request, not direct memory.
- Executing an approved `saveMemory` action creates an active memory record.
- Memory lookup is limited to current company id.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- brain-memory.service.spec.ts
```

Expected output: memory service tests pass.

## Task 4 - Brain Intent Parser

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\prometheus-brain-parser.ts`.

Parser rules:

```ts
export type PrometheusBrainIntent =
  | "search"
  | "map"
  | "nearbyService"
  | "hazmatQuestion"
  | "draftEmail"
  | "draftChat"
  | "bookingApproval"
  | "saveMemory"
  | "generalTransportation";

export function parsePrometheusBrainPrompt(prompt: string): {
  intent: PrometheusBrainIntent;
  normalizedPrompt: string;
} {
  const text = String(prompt ?? "").trim();
  const lower = text.toLowerCase();

  if (/\b(remember|save this|learn this|keep this)\b/.test(lower)) {
    return { intent: "saveMemory", normalizedPrompt: text };
  }
  if (/\b(email|send my truck list|send load list)\b/.test(lower)) {
    return { intent: "draftEmail", normalizedPrompt: text };
  }
  if (/\b(chat|message|ask broker|ask carrier)\b/.test(lower)) {
    return { intent: "draftChat", normalizedPrompt: text };
  }
  if (/\b(book|approve booking|confirm booking|secure load)\b/.test(lower)) {
    return { intent: "bookingApproval", normalizedPrompt: text };
  }
  if (/\b(map|route|deadhead|loaded miles|tolls|fuel|avoid tolls)\b/.test(lower)) {
    return { intent: "map", normalizedPrompt: text };
  }
  if (/\b(truck stop|tire shop|repair shop|washout|nearest)\b/.test(lower)) {
    return { intent: "nearbyService", normalizedPrompt: text };
  }
  if (/\b(hazmat|placard|compatible|segregation|can i transport|1\.3|tanker)\b/.test(lower)) {
    return { intent: "hazmatQuestion", normalizedPrompt: text };
  }
  if (/\b(anything|loads?|trucks?|shipments?|partials?|out of|near|from|last|past|under)\b/.test(lower)) {
    return { intent: "search", normalizedPrompt: text };
  }
  return { intent: "generalTransportation", normalizedPrompt: text };
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\prometheus-brain-parser.spec.ts`.

Test cases:

- `do you have anything out of Memphis, TN` -> `search`.
- `show me a map with deadhead miles` -> `map`.
- `email Brian my truck list` -> `draftEmail`.
- `remember James does not like over 44000` -> `saveMemory`.
- `can I transport this two hazmat together` -> `hazmatQuestion`.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- prometheus-brain-parser.spec.ts
```

Expected output: parser tests pass.

## Task 5 - Prometheus Brain Service

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\dto\prometheus-brain.dto.ts`.

```ts
import { PrometheusBrainSource } from "../interface/prometheus-brain-event.interface";

export class PrometheusBrainPromptDTO {
  prompt: string;
  source: PrometheusBrainSource;
  related?: {
    sourcePostId?: string;
    sourcePostType?: "brokerPost" | "carrierPost";
    roomId?: string;
    loadId?: string;
    companyId?: string;
  };
}

export class UpdateBrainSettingsDTO {
  memoryMode?: "off" | "companyManaged" | "prometheusManaged";
  auditRetentionDays?: number;
  allowProviderTools?: boolean;
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\prometheus-brain.service.ts`.

Core service flow:

```ts
async handlePrompt(data: PrometheusBrainPromptDTO, user: any) {
  const companyId = String(user?.companyId ?? "");
  const userId = String(user?._id ?? "");
  const role = String(user?.role ?? "");
  const source = data.source || "matching";
  const prompt = String(data.prompt ?? "").trim();

  if (!prompt) {
    throw new BadRequestException("Prompt is required.");
  }

  await this.events.record({
    companyId,
    userId,
    role,
    source,
    type: "promptReceived",
    prompt,
    related: data.related,
  });

  const parsed = parsePrometheusBrainPrompt(prompt);
  await this.events.record({
    companyId,
    userId,
    role,
    source,
    type: "intentClassified",
    prompt,
    intent: parsed.intent,
  });

  if (parsed.intent === "search" || parsed.intent === "map") {
    const result = await this.agentCommands.handlePrompt(prompt, user);
    const answer = result.handled
      ? result.message
      : "I can help search hazmat loads and trucks. Tell me city, state, equipment, weight, date, or how far back to check.";
    const event = await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "suggestionShown",
      prompt,
      intent: parsed.intent,
      tool: "agentCommandSearch",
      message: answer,
      payload: result.metadata ?? {},
      related: data.related,
    });
    return {
      handled: true,
      intent: parsed.intent,
      answer,
      eventId: String(event?._id ?? ""),
      metadata: result.metadata ?? {},
    };
  }

  if (parsed.intent === "draftEmail") {
    return this.createDraftApproval({
      user,
      source,
      prompt,
      related: data.related,
      actionType: "sendEmail",
      label: "Approve email draft",
      summary: `Prometheus drafted an email from your request: ${prompt}`,
      riskNote: "Email is not sent until a human approves and an email provider is connected.",
    });
  }

  if (parsed.intent === "draftChat") {
    return this.createDraftApproval({
      user,
      source,
      prompt,
      related: data.related,
      actionType: "sendChat",
      label: "Approve chat message",
      summary: `Prometheus drafted a chat message from your request: ${prompt}`,
      riskNote: "Chat is not sent until a human approves it.",
    });
  }

  if (parsed.intent === "bookingApproval") {
    return this.createDraftApproval({
      user,
      source,
      prompt,
      related: data.related,
      actionType: "startBookingApproval",
      label: "Approve booking request",
      summary: "Prometheus can start the booking approval conversation for both sides.",
      riskNote: "Both broker and carrier still need to approve before the load moves to booking chat.",
    });
  }

  if (parsed.intent === "saveMemory") {
    const request = await this.memory.requestSaveMemory({
      companyId,
      userId,
      role,
      content: prompt,
      scope: "company",
      subjectKey: companyId,
      subjectLabel: "Company preference",
      tags: ["user-requested"],
    });
    if (request?.blocked) {
      return {
        handled: true,
        intent: parsed.intent,
        answer: request.message,
      };
    }
    return {
      handled: true,
      intent: parsed.intent,
      answer: "I prepared this memory for approval. I will not save it until an authorized user approves it.",
      approval: request,
    };
  }

  const answer = this.renderKnowledgeAnswer(parsed.intent, prompt);
  await this.events.record({
    companyId,
    userId,
    role,
    source,
    type: "suggestionShown",
    prompt,
    intent: parsed.intent,
    tool: "deterministicTransportationAnswer",
    message: answer,
  });
  return { handled: true, intent: parsed.intent, answer };
}
```

Knowledge answer requirements:

- Hazmat questions must be cautious and ask the user to verify with company safety/legal policy and current DOT/PHMSA rules before dispatch.
- Nearby service and route map prompts should say Prometheus can prepare route intelligence and provider connection, but live map/provider is not connected in V1.
- General transportation prompt should answer as dispatcher/broker assistant without pretending to take external action.

- [ ] Add `createDraftApproval()` helper that stores a pending approval and returns a conversational answer:

```ts
private async createDraftApproval(input: {
  user: any;
  source: PrometheusBrainSource;
  prompt: string;
  related?: Record<string, string>;
  actionType: PrometheusBrainActionType;
  label: string;
  summary: string;
  riskNote: string;
}) {
  const approval = await this.approvals.createRequest({
    companyId: String(input.user.companyId ?? ""),
    requestedBy: String(input.user._id ?? ""),
    role: String(input.user.role ?? ""),
    actionType: input.actionType,
    label: input.label,
    summary: input.summary,
    riskNote: input.riskNote,
    payload: {
      prompt: input.prompt,
      related: input.related ?? {},
      providerStatus: "not_connected",
    },
  });
  return {
    handled: true,
    intent: input.actionType,
    answer: `${input.label}: ${input.summary}`,
    approval,
  };
}
```

- [ ] Add tests in `C:\Prometheus-Clean\prometheus-backend\src\brain\prometheus-brain.service.spec.ts`:

Test cases:

- Search prompt calls `AgentCommandService.handlePrompt()` and records prompt, classified intent, and suggestion events.
- Email prompt returns approval request and does not send email.
- Booking prompt returns approval request and does not create booking directly.
- Memory prompt with memory disabled returns current-session-only response.
- Hazmat question returns cautious transportation guidance and event.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- prometheus-brain.service.spec.ts
```

Expected output: Brain service tests pass.

## Task 6 - Brain Controller and Module

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\prometheus-brain.controller.ts`.

```ts
import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Roles } from "../shared/decorators/roles.decorator";
import { BrainApprovalService } from "./brain-approval.service";
import { BrainEventService } from "./brain-event.service";
import { BrainMemoryService } from "./brain-memory.service";
import { PrometheusBrainPromptDTO, UpdateBrainSettingsDTO } from "./dto/prometheus-brain.dto";
import { PrometheusBrainService } from "./prometheus-brain.service";

@ApiTags("brain")
@Controller("brain")
export class PrometheusBrainController {
  constructor(
    private readonly brain: PrometheusBrainService,
    private readonly events: BrainEventService,
    private readonly approvals: BrainApprovalService,
    private readonly memory: BrainMemoryService
  ) {}

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Post("prompt")
  @ApiOkResponse({ status: 200 })
  prompt(@Body() data: PrometheusBrainPromptDTO, @Req() req) {
    return this.brain.handlePrompt(data, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get("events")
  listEvents(@Req() req) {
    return this.events.listForCompany(String(req.user.companyId));
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get("approvals")
  listApprovals(@Req() req) {
    return this.approvals.listForCompany(String(req.user.companyId));
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Patch("approvals/:approvalId/approve")
  approve(@Param("approvalId") approvalId: string, @Req() req) {
    return this.approvals.approve(approvalId, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Patch("approvals/:approvalId/reject")
  reject(@Param("approvalId") approvalId: string, @Req() req) {
    return this.approvals.reject(approvalId, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get("memory")
  listMemory(@Req() req) {
    return this.memory.listForCompany(String(req.user.companyId));
  }

  @Roles("admin", "supervisor", "superadmin")
  @Patch("settings")
  updateSettings(@Body() data: UpdateBrainSettingsDTO, @Req() req) {
    return this.memory.updateCompanySettings(String(req.user.companyId), String(req.user._id), data);
  }
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus-backend\src\brain\brain.module.ts`.

```ts
import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CompanySchema } from "../company/schema/company.schema";
import { MatchingModule } from "../matching/matching.module";
import { BrainApprovalService } from "./brain-approval.service";
import { BrainEventService } from "./brain-event.service";
import { BrainMemoryService } from "./brain-memory.service";
import { PrometheusBrainController } from "./prometheus-brain.controller";
import { PrometheusBrainService } from "./prometheus-brain.service";
import { PrometheusBrainApprovalSchema } from "./schema/prometheus-brain-approval.schema";
import { PrometheusBrainEventSchema } from "./schema/prometheus-brain-event.schema";
import { PrometheusBrainMemorySchema } from "./schema/prometheus-brain-memory.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Company", schema: CompanySchema },
      { name: "prometheusBrainEvent", schema: PrometheusBrainEventSchema },
      { name: "prometheusBrainApproval", schema: PrometheusBrainApprovalSchema },
      { name: "prometheusBrainMemory", schema: PrometheusBrainMemorySchema },
    ]),
    forwardRef(() => MatchingModule),
  ],
  controllers: [PrometheusBrainController],
  providers: [PrometheusBrainService, BrainEventService, BrainApprovalService, BrainMemoryService],
  exports: [PrometheusBrainService, BrainEventService, BrainApprovalService, BrainMemoryService],
})
export class BrainModule {}
```

- [ ] Patch `C:\Prometheus-Clean\prometheus-backend\src\app.module.ts` to import `BrainModule` after `MatchingModule`.

```ts
import { BrainModule } from "./brain/brain.module";
```

Add to imports:

```ts
    MatchingModule,
    BrainModule,
```

- [ ] Add controller tests in `C:\Prometheus-Clean\prometheus-backend\src\brain\prometheus-brain.controller.spec.ts`:

Test cases:

- `prompt()` passes current user to service.
- `approve()` passes approval id and current user.
- `updateSettings()` accepts admin-like role flow through service.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- prometheus-brain.controller.spec.ts
npm run build
```

Expected output: controller tests pass and backend build completes.

## Task 7 - Approval Execution Rules

- [ ] Finish `BrainApprovalService.approve()`.

Behavior:

- If approval belongs to another company, throw `ForbiddenException`.
- If status is not pending, throw `BadRequestException`.
- If action type is `saveMemory`, call `BrainMemoryService.saveApprovedMemory()` and mark approval `executed`.
- If action type is any external/provider action, mark approval `approved` with `result.providerStatus = "pending_provider_connection"` and do not send anything.
- Record `approvalAccepted` and `actionExecuted` events.

Implementation shape:

```ts
async approve(approvalId: string, user: any) {
  const approval = await this.findCompanyApproval(approvalId, user);
  if (approval.status !== "pending") {
    throw new BadRequestException("This approval is not pending.");
  }

  let status: "approved" | "executed" = "approved";
  let result: Record<string, unknown> = {
    providerStatus: "pending_provider_connection",
    message: "Approved. Provider execution is not connected in Brain V1.",
  };

  if (approval.actionType === "saveMemory") {
    const saved = await this.memory.saveApprovedMemory(approval, user);
    status = "executed";
    result = { memoryId: String(saved?._id ?? ""), message: "Memory saved." };
  }

  const updated = await this.approvalModel
    .findByIdAndUpdate(
      approvalId,
      {
        status,
        result,
        decidedBy: String(user._id),
        decisionAt: new Date(),
      },
      { new: true }
    )
    .lean<any>();

  await this.events.record({
    companyId: String(user.companyId),
    userId: String(user._id),
    role: String(user.role),
    source: "matching",
    type: "approvalAccepted",
    intent: approval.actionType,
    message: approval.summary,
    payload: approval.payload,
  });

  await this.events.record({
    companyId: String(user.companyId),
    userId: String(user._id),
    role: String(user.role),
    source: "matching",
    type: "actionExecuted",
    intent: approval.actionType,
    message: String(result.message ?? "Approved."),
    payload: result,
  });

  return updated;
}
```

- [ ] Add tests:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- brain-approval.service.spec.ts
```

Expected output: tests prove no provider action is executed in V1.

## Task 8 - Angular Brain Types and API

- [ ] Patch `C:\Prometheus-Clean\prometheus\src\app\shared\types\models.ts` to add:

```ts
export type PrometheusBrainSource = 'matching' | 'booking' | 'direct' | 'company' | 'loads' | 'admin';

export type PrometheusBrainApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed';

export interface PrometheusBrainApproval {
  _id?: string;
  companyId: string;
  requestedBy: string;
  decidedBy?: string;
  role: string;
  actionType: string;
  label: string;
  summary: string;
  riskNote: string;
  payload: Record<string, unknown>;
  status: PrometheusBrainApprovalStatus;
  expiresAt?: string | Date;
  decisionAt?: string | Date;
  result?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface PrometheusBrainEvent {
  _id?: string;
  companyId: string;
  userId: string;
  role: string;
  source: PrometheusBrainSource;
  type: string;
  prompt?: string;
  message?: string;
  intent?: string;
  tool?: string;
  related?: Record<string, string>;
  payload?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface PrometheusBrainPromptRequest {
  prompt: string;
  source: PrometheusBrainSource;
  related?: {
    sourcePostId?: string;
    sourcePostType?: MatchSourcePostType;
    roomId?: string;
    loadId?: string;
    companyId?: string;
  };
}

export interface PrometheusBrainPromptResponse {
  answer: string;
  handled: boolean;
  intent: string;
  eventId?: string;
  approval?: PrometheusBrainApproval;
  metadata?: Record<string, unknown>;
}

export interface UpdateBrainSettingsPayload {
  memoryMode?: 'off' | 'companyManaged' | 'prometheusManaged';
  auditRetentionDays?: number;
  allowProviderTools?: boolean;
}
```

- [ ] Add `C:\Prometheus-Clean\prometheus\src\app\core\api\brain-api.service.ts`.

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PrometheusBrainApproval,
  PrometheusBrainEvent,
  PrometheusBrainPromptRequest,
  PrometheusBrainPromptResponse,
  UpdateBrainSettingsPayload,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class BrainApiService {
  constructor(private readonly http: HttpClient) {}

  sendPrompt(payload: PrometheusBrainPromptRequest): Observable<PrometheusBrainPromptResponse> {
    return this.http.post<PrometheusBrainPromptResponse>('brain/prompt', payload);
  }

  listEvents(): Observable<PrometheusBrainEvent[]> {
    return this.http.get<PrometheusBrainEvent[]>('brain/events');
  }

  listApprovals(): Observable<PrometheusBrainApproval[]> {
    return this.http.get<PrometheusBrainApproval[]>('brain/approvals');
  }

  approve(approvalId: string): Observable<PrometheusBrainApproval> {
    return this.http.patch<PrometheusBrainApproval>(`brain/approvals/${approvalId}/approve`, {});
  }

  reject(approvalId: string): Observable<PrometheusBrainApproval> {
    return this.http.patch<PrometheusBrainApproval>(`brain/approvals/${approvalId}/reject`, {});
  }

  updateSettings(payload: UpdateBrainSettingsPayload): Observable<unknown> {
    return this.http.patch('brain/settings', payload);
  }
}
```

- [ ] Add API service tests in `C:\Prometheus-Clean\prometheus\src\app\core\api\brain-api.service.spec.ts`.

Test cases:

- `sendPrompt()` posts to `brain/prompt`.
- `approve()` patches `brain/approvals/:id/approve`.
- `reject()` patches `brain/approvals/:id/reject`.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus
npx ng test --watch=false --include src/app/core/api/brain-api.service.spec.ts
```

Expected output: Brain API service specs pass.

## Task 9 - AI Matching Console Uses Brain

- [ ] Patch `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.ts`.

Add import:

```ts
import { BrainApiService } from '../../core/api/brain-api.service';
```

Add types to existing imports from models:

```ts
  PrometheusBrainApproval,
  PrometheusBrainPromptResponse,
```

Add constructor dependency:

```ts
private readonly brainApi: BrainApiService,
```

Add component state:

```ts
pendingBrainApprovals: PrometheusBrainApproval[] = [];
```

Route matching prompt through Brain in the existing matching command submit method. Preserve the current bubbles and input.

```ts
private sendBrainMatchingPrompt(prompt: string): void {
  const sourcePostId = this.selectedMatchSourcePostId();
  this.addMatchingBubble('user', prompt, 'You');
  this.matchingBusy = true;

  this.brainApi.sendPrompt({
    prompt,
    source: 'matching',
    related: sourcePostId ? { sourcePostId } : undefined,
  }).pipe(
    catchError(() => {
      this.addMatchingBubble('assistant', 'Prometheus could not answer right now. Try again.', 'Prometheus');
      return of(null);
    }),
    finalize(() => {
      this.matchingBusy = false;
    })
  ).subscribe((response: PrometheusBrainPromptResponse | null) => {
    if (!response) {
      return;
    }
    this.addMatchingBubble('assistant', response.answer, 'Prometheus');
    if (response.approval) {
      this.pendingBrainApprovals = [response.approval].concat(this.pendingBrainApprovals);
    }
  });
}
```

Approval click handlers:

```ts
approveBrainRequest(approval: PrometheusBrainApproval): void {
  const id = approval._id;
  if (!id) {
    return;
  }
  this.brainApi.approve(id).subscribe((updated) => {
    this.pendingBrainApprovals = this.pendingBrainApprovals.map((item) =>
      item._id === id ? updated : item
    );
    this.addMatchingBubble('assistant', updated.result?.['message'] as string || 'Approved.', 'Prometheus');
  });
}

rejectBrainRequest(approval: PrometheusBrainApproval): void {
  const id = approval._id;
  if (!id) {
    return;
  }
  this.brainApi.reject(id).subscribe((updated) => {
    this.pendingBrainApprovals = this.pendingBrainApprovals.map((item) =>
      item._id === id ? updated : item
    );
    this.addMatchingBubble('assistant', 'Rejected. I will not take that action.', 'Prometheus');
  });
}
```

- [ ] Patch `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.html`.

Render approval prompts inside the matching console only, below the assistant message stream and above input:

```html
<div class="brain-approval-stack" *ngIf="activeTab === 'matching' && pendingBrainApprovals.length">
  <article
    class="brain-approval-card"
    *ngFor="let approval of pendingBrainApprovals"
    [class.is-complete]="approval.status !== 'pending'"
  >
    <div>
      <p class="eyebrow">PROMETHEUS APPROVAL</p>
      <h3>{{ approval.label }}</h3>
      <p>{{ approval.summary }}</p>
      <small>{{ approval.riskNote }}</small>
    </div>
    <div class="brain-approval-actions" *ngIf="approval.status === 'pending'">
      <button type="button" class="button-primary" (click)="approveBrainRequest(approval)">Approve</button>
      <button type="button" class="button-secondary" (click)="rejectBrainRequest(approval)">Reject</button>
    </div>
    <span class="status-pill" *ngIf="approval.status !== 'pending'">{{ approval.status }}</span>
  </article>
</div>
```

- [ ] Patch `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.scss`.

Use existing dark console styling, no layout shift:

```scss
.brain-approval-stack {
  display: grid;
  gap: 12px;
  margin: 12px 0;
}

.brain-approval-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 8px;
  background: rgba(15, 32, 46, 0.96);
  padding: 16px;
}

.brain-approval-card.is-complete {
  opacity: 0.72;
}

.brain-approval-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
```

- [ ] Patch `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.spec.ts`.

Test cases:

- Sending text in matching console calls `BrainApiService.sendPrompt()`.
- Brain answer is appended to matching bubbles.
- Approval response renders and approve click calls `BrainApiService.approve()`.
- Reject click calls `BrainApiService.reject()`.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus
npx ng test --watch=false --include src/app/features/workspace/workspace.component.spec.ts
```

Expected output: workspace spec passes.

## Task 10 - Brain Settings UI Entry

- [ ] Add a compact Brain settings block to the existing company setup/admin view inside `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.html`.

This block should be visible only for admin, supervisor, and superadmin users.

Controls:

- Memory mode select: Off, Company managed, Prometheus managed.
- Audit retention numeric input.
- Provider tools toggle.
- Save button.

Behavior:

- Default memory is Off.
- Saving calls `BrainApiService.updateSettings()`.
- The UI copy must state that Prometheus does not save company memory unless memory is enabled and a human approves the memory.

- [ ] Add component state and submit method to `workspace.component.ts`:

```ts
brainSettingsForm = this.fb.group({
  memoryMode: ['off'],
  auditRetentionDays: [365],
  allowProviderTools: [false],
});

saveBrainSettings(): void {
  if (!this.canManageCompanySetup) {
    return;
  }
  this.brainApi.updateSettings(this.brainSettingsForm.getRawValue()).subscribe(() => {
    this.addSystemNotice('Brain settings saved.');
  });
}
```

- [ ] Add tests:

- Admin sees settings and can save.
- Dispatcher/carrier user does not see settings.

- [ ] Run:

```powershell
cd C:\Prometheus-Clean\prometheus
npx ng test --watch=false --include src/app/features/workspace/workspace.component.spec.ts
```

Expected output: workspace spec passes.

## Task 11 - Manual QA Script

- [ ] Start backend and frontend if they are not running.

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm run start:dev
```

```powershell
cd C:\Prometheus-Clean\prometheus
npm start -- --port 4300
```

- [ ] Login as an approved broker user.

- [ ] Open AI Matching Console and send:

```text
do you have anything out of Memphis, TN?
```

Expected:

- The prompt appears as user text.
- Prometheus returns a hazmat load/truck search answer.
- No `Prometheus could not answer right now` error.

- [ ] Send:

```text
email Brian my truck list and ask if he has anything out of CO
```

Expected:

- Prometheus returns an approval card.
- Nothing is sent externally.
- Approve marks provider pending.
- Reject marks rejected and does nothing.

- [ ] Send:

```text
remember James does not like loads over 44000 lb
```

Expected with memory off:

- Prometheus says memory is off and it will not save.

Expected after admin enables company-managed memory:

- Prometheus creates an approval request.
- Approving saves the memory.

- [ ] Send:

```text
can I transport 1.3 hazmat with this other product?
```

Expected:

- Prometheus gives cautious hazmat guidance and asks to verify with safety/legal and current regulations.
- No operational action happens.

## Task 12 - Full Verification

- [ ] Run backend focused tests:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- brain
npm test -- matching
```

Expected output: all Brain and matching tests pass.

- [ ] Run backend build:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm run build
```

Expected output: build completes with no TypeScript errors.

- [ ] Run frontend focused tests:

```powershell
cd C:\Prometheus-Clean\prometheus
npx ng test --watch=false --include src/app/core/api/brain-api.service.spec.ts --include src/app/features/workspace/workspace.component.spec.ts
```

Expected output: focused Angular tests pass.

- [ ] Run frontend build:

```powershell
cd C:\Prometheus-Clean\prometheus
npm run build
```

Expected output: build completes. Existing budget warnings are acceptable if unchanged.

- [ ] Run browser verification at `http://localhost:4300/workspace`.

Expected:

- AI Matching Console loads.
- Brain prompt answers.
- Approval card appears for email/booking/save-memory prompts.
- No red compile overlay.
- No layout change to existing posting, booking, load, direct chat, or onboarding controls.

## Commit Plan

- [ ] After Task 6 backend compiles:

```powershell
git add prometheus-backend/src/brain prometheus-backend/src/company/schema/company.schema.ts prometheus-backend/src/app.module.ts
git commit -m "feat: add Prometheus Brain backend foundation"
```

- [ ] After Task 10 frontend compiles:

```powershell
git add prometheus/src/app/core/api/brain-api.service.ts prometheus/src/app/shared/types/models.ts prometheus/src/app/features/workspace
git commit -m "feat: connect workspace to Prometheus Brain"
```

- [ ] After full verification:

```powershell
git status --short
```

Expected output: no uncommitted implementation changes except intentionally running local files that should remain ignored.

## Implementation Notes

- Keep all provider actions disabled until provider credentials and exact APIs are implemented.
- Preserve current tabs and button positions.
- Keep legal/financial/operational actions behind approval requests.
- Use deterministic backend tools as source of truth; model output can assist language later but cannot bypass service rules.
- Store enough event detail to prove what Prometheus suggested, what the human approved, and what was actually executed.
- Default company memory to off.
- Never silently save driver, broker, lane, rate, customer, or legal preference memory.
- Do not add a separate "posting AI" and "matching AI"; Brain V1 is one assistant endpoint that can be called from multiple consoles.
