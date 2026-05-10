# Prometheus Agent Command Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working slice of the Prometheus Agent Core: fix the QA blockers, then let the AI Matching Console understand practical natural-language search commands while preserving deterministic backend matching as the source of truth.

**Architecture:** Keep the existing posting, matching snapshots, and booking services. Add a focused backend command parser and search responder that translates text such as "anything out of Memphis from the last 5 hours under 44k" into safe Mongo queries and assistant events. The first slice does not add autonomous email, booking, live Google Maps, or company memory yet.

**Tech Stack:** NestJS, Mongoose, Jest, Angular workspace UI, existing WebSocket gateway, existing matching assistant event model.

---

## Scope

This plan intentionally covers Phase 1 only:

- fix live QA bugs discovered during owner/broker/carrier testing;
- support natural-language search/filter commands in the Matching Console;
- return conversational assistant messages from deterministic search results;
- keep approval-based booking behavior unchanged;
- leave company memory, outbound email, Google map rendering, ELD intelligence, and provider integrations for later plans.

## File Structure

- Modify `prometheus-backend/src/shared/validarors/existing-email.validator.ts`
  - Fix new-user email validation when the DTO has no `_id`.
- Modify `prometheus-backend/src/post-broker/post.service.ts`
  - Fix `ObjectId` construction.
  - Normalize capacity/equipment search variants so existing posts can match.
- Modify `prometheus-backend/src/post-carrier/post.service.ts`
  - Fix `ObjectId` construction.
  - Normalize capacity/equipment search variants so existing posts can match.
- Modify `prometheus-backend/src/matching/hazmat-match-classifier.ts`
  - Treat base equipment like `V`/`R` as hazmat-capable when `nonHazmat !== true`.
- Modify `prometheus-backend/src/matching/hazmat-match-classifier.spec.ts`
  - Add tests for base equipment hazmat matching.
- Create `prometheus-backend/src/matching/agent-command-parser.ts`
  - Pure parser for search/map/posting-style user commands.
- Create `prometheus-backend/src/matching/agent-command-parser.spec.ts`
  - Tests for natural-language command parsing.
- Create `prometheus-backend/src/matching/agent-command.service.ts`
  - Runs parsed read-only search commands and renders assistant event payloads.
- Create `prometheus-backend/src/matching/agent-command.service.spec.ts`
  - Tests that command execution is deterministic and company-safe.
- Modify `prometheus-backend/src/matching/matching.module.ts`
  - Register the new service.
- Modify `prometheus-backend/src/matching/matching-assistant.service.ts`
  - Route broad prompts to `AgentCommandService` before falling back to existing match-index commands.
- Modify `prometheus-backend/src/matching/matching-assistant.service.spec.ts`
  - Add tests for command routing.
- Modify `prometheus/src/app/features/workspace/workspace.component.ts`
  - Keep existing UI, but make failure wording clearer if a natural-language command returns no data.
- Modify `prometheus/src/app/features/workspace/workspace.component.spec.ts`
  - Add a small UI expectation only if backend event rendering changes require it.

---

## Task 1: Fix QA Blockers Before Agent Work

**Files:**

- Modify: `prometheus-backend/src/shared/validarors/existing-email.validator.ts`
- Modify: `prometheus-backend/src/post-broker/post.service.ts`
- Modify: `prometheus-backend/src/post-carrier/post.service.ts`
- Modify: `prometheus-backend/src/matching/hazmat-match-classifier.ts`
- Test: `prometheus-backend/src/matching/hazmat-match-classifier.spec.ts`

- [ ] **Step 1: Add failing hazmat classifier tests**

Add these tests to `prometheus-backend/src/matching/hazmat-match-classifier.spec.ts`:

```ts
it("treats a base dry van code as hazmat capable when the post is not marked non-hazmat", () => {
  const decision = classifyHazmatCandidate({
    sourcePostType: "carrierPost",
    sourceEquipment: ["V"],
    candidateEquipment: ["V"],
    sourceWeight: 45000,
    candidateWeight: 42000,
    sourceNonHazmat: false,
    candidateNonHazmat: false,
  });

  expect(decision.tier).toBe("strictHazmat");
  expect(decision.hazmatCompatible).toBe(true);
  expect(decision.equipmentCompatibility).toBe("exact");
});

it("asks permission when a base dry van hazmat load may ride on reefer equipment", () => {
  const decision = classifyHazmatCandidate({
    sourcePostType: "brokerPost",
    sourceEquipment: ["V"],
    candidateEquipment: ["R"],
    sourceWeight: 42000,
    candidateWeight: 45000,
    sourceNonHazmat: false,
    candidateNonHazmat: false,
  });

  expect(decision.tier).toBe("hazmatPermission");
  expect(decision.permissionQuestion).toContain("van hazmat load");
  expect(decision.permissionQuestion).toContain("reefer hazmat equipment");
});
```

- [ ] **Step 2: Run classifier tests and confirm they fail**

Run:

```powershell
npm test -- hazmat-match-classifier.spec.ts
```

Expected before implementation: FAIL because base equipment `V` and `R` are not considered hazmat-capable.

- [ ] **Step 3: Fix email uniqueness validation**

Replace `EmailExists.validate` with:

```ts
  async validate(email: string, args: ValidationArguments) {
    try {
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      if (!normalizedEmail) {
        return true;
      }

      const mongoose = require("mongoose");
      const rawId = (args.object as any)?._id;
      const query: any = { email: normalizedEmail };

      if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
        query._id = { $ne: new mongoose.Types.ObjectId(rawId) };
      }

      const existingEmail = await this.UserModel.findOne(query);
      return !existingEmail;
    } catch (e) {
      return false;
    }
  }
```

- [ ] **Step 4: Fix Mongoose ObjectId construction**

In both post services, replace:

```ts
let id = mongoose.Types.ObjectId(postId);
```

with:

```ts
let id = new mongoose.Types.ObjectId(postId);
```

Also replace edit/update call sites where the code currently calls `mongoose.Types.ObjectId(value)` without `new`.

- [ ] **Step 5: Add capacity and equipment search helpers**

In both post services, add private helpers:

```ts
  private buildCapacitySearch(value: any): string[] {
    const normalized = String(value ?? "both").trim().toLowerCase();
    const values = normalized === "both" || !normalized
      ? ["full", "partial"]
      : [normalized];

    const variants = values.flatMap((entry) => [
      entry,
      entry.toUpperCase(),
      entry.charAt(0).toUpperCase() + entry.slice(1),
    ]);
    return [...new Set(variants)];
  }

  private buildEquipmentSearch(value: any): string[] {
    const rawItems = Array.isArray(value) ? value : [value];
    const normalized = rawItems
      .map((item) => String(item ?? "").trim().toUpperCase())
      .filter(Boolean);
    const expanded = normalized.flatMap((code) => {
      if (code === "V" || code === "VZ") return ["V", "VZ"];
      if (code === "R" || code === "RZ") return ["R", "RZ"];
      if (code === "F" || code === "FZ") return ["F", "FZ"];
      if (code === "C" || code === "CZ") return ["C", "CZ"];
      if (code === "T" || code === "TZ") return ["T", "TZ"];
      return [code];
    });
    return [...new Set(expanded)];
  }
```

Then replace `capacitySearch` construction in `search()` with:

```ts
const capacitySearch = this.buildCapacitySearch(data.capacitySearch);
const equipmentSearch = this.buildEquipmentSearch(data.equipment);
```

Pass `equipmentSearch` into search helpers or assign:

```ts
data = { ...data, equipment: equipmentSearch };
```

- [ ] **Step 6: Update hazmat classifier equipment logic**

In `hazmat-match-classifier.ts`, add:

```ts
const BASE_TO_HAZMAT_CODE: Record<string, string> = {
  V: "VZ",
  R: "RZ",
  F: "FZ",
  C: "CZ",
  T: "TZ",
};

function effectiveHazmatCodes(equipment: string[], nonHazmat?: boolean): string[] {
  if (nonHazmat) {
    return equipment;
  }

  return [...new Set(equipment.map((code) => BASE_TO_HAZMAT_CODE[code] ?? code))];
}
```

Then use effective codes for hazmat detection and equipment comparisons:

```ts
const sourceEquipment = effectiveHazmatCodes(
  normalizeEquipmentCodes(input.sourceEquipment),
  input.sourceNonHazmat
);
const candidateEquipment = effectiveHazmatCodes(
  normalizeEquipmentCodes(input.candidateEquipment),
  input.candidateNonHazmat
);
```

- [ ] **Step 7: Verify tests pass**

Run:

```powershell
npm test -- hazmat-match-classifier.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Manual QA for fixed blocker endpoints**

Use API calls or the existing app session to verify:

- creating a company user no longer returns false duplicate email for a new email;
- `GET /broker/post/:id` no longer 500s for an existing broker post;
- a Chicago to Memphis `V` load and `V` truck can produce a strict hazmat match.

- [ ] **Step 9: Commit QA blocker fixes**

```powershell
git add -- prometheus-backend/src/shared/validarors/existing-email.validator.ts prometheus-backend/src/post-broker/post.service.ts prometheus-backend/src/post-carrier/post.service.ts prometheus-backend/src/matching/hazmat-match-classifier.ts prometheus-backend/src/matching/hazmat-match-classifier.spec.ts
git commit -m "fix: unblock user creation and hazmat matching"
```

---

## Task 2: Add Pure Agent Command Parser

**Files:**

- Create: `prometheus-backend/src/matching/agent-command-parser.ts`
- Create: `prometheus-backend/src/matching/agent-command-parser.spec.ts`

- [ ] **Step 1: Create parser tests**

Create `prometheus-backend/src/matching/agent-command-parser.spec.ts`:

```ts
import { parseAgentCommand } from "./agent-command-parser";

describe("parseAgentCommand", () => {
  it("parses city search with age and weight filters", () => {
    expect(parseAgentCommand("do you have anything out of Memphis from the last 5 hours under 44000 pounds")).toEqual({
      intent: "search",
      originCity: "Memphis",
      originState: "",
      maxAgeHours: 5,
      maxWeight: 44000,
      capacity: "any",
      limit: 20,
      showMore: false,
      mapRequested: false,
    });
  });

  it("parses state abbreviations and partial filters", () => {
    expect(parseAgentCommand("show me only partial shipments out of Houston, TX under 30 feet")).toEqual({
      intent: "search",
      originCity: "Houston",
      originState: "TX",
      maxAgeHours: null,
      maxWeight: null,
      maxLength: 30,
      capacity: "partial",
      limit: 20,
      showMore: false,
      mapRequested: false,
    });
  });

  it("parses map requests", () => {
    expect(parseAgentCommand("show me a map with loads around my truck in Houston TX")).toMatchObject({
      intent: "search",
      originCity: "Houston",
      originState: "TX",
      mapRequested: true,
    });
  });

  it("parses show more", () => {
    expect(parseAgentCommand("show me more")).toMatchObject({
      intent: "showMore",
      showMore: true,
    });
  });

  it("returns unknown for booking commands handled by existing opportunity flow", () => {
    expect(parseAgentCommand("book option 1")).toEqual({ intent: "unknown" });
  });
});
```

- [ ] **Step 2: Run parser tests and confirm they fail**

Run:

```powershell
npm test -- agent-command-parser.spec.ts
```

Expected: FAIL because the file does not exist yet.

- [ ] **Step 3: Implement parser**

Create `prometheus-backend/src/matching/agent-command-parser.ts`:

```ts
export type AgentCommandIntent = "search" | "showMore" | "unknown";

export interface ParsedAgentCommand {
  intent: AgentCommandIntent;
  originCity?: string;
  originState?: string;
  maxAgeHours?: number | null;
  maxWeight?: number | null;
  maxLength?: number | null;
  capacity?: "full" | "partial" | "any";
  limit?: number;
  showMore?: boolean;
  mapRequested?: boolean;
}

const BOOKING_COMMAND = /\b(book|ask about|ask|accept|reject)\s+(option|match)?\s*\d+\b/i;
const CITY_PATTERN = /\b(?:out of|around|near|in|from)\s+([a-zA-Z .'-]+?)(?:,\s*|\s+)([A-Z]{2})?\b(?=\s|$|under|from|last|with|only|for)/i;
const AGE_PATTERN = /\b(?:last|past)\s+(\d{1,3})\s*(?:h|hr|hrs|hour|hours)\b/i;
const WEIGHT_PATTERN = /\b(?:under|below|less than|max(?:imum)?)\s*\$?\s*(\d{2,3}(?:,\d{3})?|\d{4,6})\s*(?:lb|lbs|pounds)?\b/i;
const LENGTH_PATTERN = /\b(?:under|below|less than|max(?:imum)?)\s*(\d{1,2})\s*(?:ft|feet|foot)\b/i;

export function parseAgentCommand(prompt: string): ParsedAgentCommand {
  const text = String(prompt ?? "").trim();
  const lower = text.toLowerCase();

  if (!text || BOOKING_COMMAND.test(text)) {
    return { intent: "unknown" };
  }

  if (/\b(show|see)\s+(me\s+)?more\b/i.test(text)) {
    return { intent: "showMore", showMore: true };
  }

  const looksSearchLike = /\b(anything|loads?|trucks?|shipments?|partials?|map|around|out of|near|from)\b/i.test(text);
  if (!looksSearchLike) {
    return { intent: "unknown" };
  }

  const cityMatch = text.match(CITY_PATTERN);
  const ageMatch = text.match(AGE_PATTERN);
  const weightMatch = text.match(WEIGHT_PATTERN);
  const lengthMatch = text.match(LENGTH_PATTERN);
  const capacity = /\bpartial|partials|ltl\b/i.test(text)
    ? "partial"
    : /\bfull|ftl\b/i.test(text)
    ? "full"
    : "any";

  return {
    intent: "search",
    originCity: cleanCity(cityMatch?.[1]),
    originState: String(cityMatch?.[2] ?? "").trim().toUpperCase(),
    maxAgeHours: ageMatch ? Number(ageMatch[1]) : null,
    maxWeight: weightMatch ? Number(weightMatch[1].replace(/,/g, "")) : null,
    maxLength: lengthMatch ? Number(lengthMatch[1]) : undefined,
    capacity,
    limit: 20,
    showMore: false,
    mapRequested: /\bmap|around\b/i.test(text),
  };
}

function cleanCity(value: string | undefined): string {
  const cleaned = String(value ?? "")
    .replace(/\b(my|the|your|truck|loads?|shipments?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}
```

- [ ] **Step 4: Run parser tests**

Run:

```powershell
npm test -- agent-command-parser.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

```powershell
git add -- prometheus-backend/src/matching/agent-command-parser.ts prometheus-backend/src/matching/agent-command-parser.spec.ts
git commit -m "feat: parse Prometheus agent commands"
```

---

## Task 3: Add Agent Command Service

**Files:**

- Create: `prometheus-backend/src/matching/agent-command.service.ts`
- Create: `prometheus-backend/src/matching/agent-command.service.spec.ts`
- Modify: `prometheus-backend/src/matching/matching.module.ts`

- [ ] **Step 1: Create service tests**

Create tests proving the service:

- searches broker loads when the current user is a carrier;
- searches carrier trucks when the current user is a broker;
- limits results to 20;
- applies `maxAgeHours`, `maxWeight`, `maxLength`, and `capacity`;
- returns a map panel flag when `mapRequested` is true;
- does not return counterpart private data beyond existing post summary fields.

Use model mocks shaped like:

```ts
const aggregateResult = [
  {
    _id: "load-1",
    company: "Brooke Broker",
    origin: { place: { city: "Memphis", state: "TN" } },
    destination: { place: { city: "Chicago", state: "IL" } },
    equipment: ["V"],
    weight: 42000,
    length: 53,
    capacity: "full",
    rate: 2500,
    publishedAt: new Date("2026-05-10T15:00:00.000Z"),
  },
];
```

- [ ] **Step 2: Implement service contract**

Create:

```ts
export interface AgentCommandResult {
  handled: boolean;
  message: string;
  sourcePostId?: string;
  metadata?: Record<string, any>;
}
```

Service method:

```ts
async handlePrompt(prompt: string, user: any): Promise<AgentCommandResult>
```

Rules:

- return `{ handled: false, message: "" }` for unknown commands;
- for carrier users, search `brokerPost`;
- for broker users, search `carrierPost`;
- use company blacklist if available;
- filter by origin city/state when parsed;
- filter by publishedAt if `maxAgeHours` exists;
- filter by weight/length/capacity if provided;
- limit to 20;
- render a short conversational result.

- [ ] **Step 3: Register service**

Add `AgentCommandService` to `MatchingModule.providers`.

- [ ] **Step 4: Run service tests**

Run:

```powershell
npm test -- agent-command.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit service**

```powershell
git add -- prometheus-backend/src/matching/agent-command.service.ts prometheus-backend/src/matching/agent-command.service.spec.ts prometheus-backend/src/matching/matching.module.ts
git commit -m "feat: answer natural matching search commands"
```

---

## Task 4: Route Matching Assistant Commands Through Agent Command Service

**Files:**

- Modify: `prometheus-backend/src/matching/matching-assistant.service.ts`
- Modify: `prometheus-backend/src/matching/matching-assistant.service.spec.ts`

- [ ] **Step 1: Update constructor tests**

Update test setup so `MatchingAssistantService` receives an `agentCommandService` mock:

```ts
const agentCommandService: any = {
  handlePrompt: jest.fn(),
};
```

Instantiate:

```ts
new MatchingAssistantService(
  opportunityModel,
  eventModel,
  messagesService,
  gateway,
  agentCommandService
);
```

- [ ] **Step 2: Add routing test**

Add:

```ts
it("routes broad search prompts to the agent command service", async () => {
  agentCommandService.handlePrompt.mockResolvedValue({
    handled: true,
    message: "I found 3 hazmat loads out of Memphis from the last 5 hours.",
    metadata: { commandType: "search" },
  });
  eventModel.create.mockImplementation(async (event) => ({ ...event, _id: "event-1" }));

  const result = await createService().handleCommand(
    { prompt: "anything out of Memphis from the last 5 hours", sourcePostId: "" },
    { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
  );

  expect(agentCommandService.handlePrompt).toHaveBeenCalledWith(
    "anything out of Memphis from the last 5 hours",
    { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
  );
  expect(result.message).toContain("3 hazmat loads");
  expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
    role: "assistant",
    message: "I found 3 hazmat loads out of Memphis from the last 5 hours.",
  }));
});
```

- [ ] **Step 3: Implement routing**

Inject `AgentCommandService` into `MatchingAssistantService` and, inside `handleCommand`, after storing the user event but before `show matches` and index commands:

```ts
const agentResult = await this.agentCommandService.handlePrompt(prompt, user);
if (agentResult.handled) {
  const event = await this.createEvent({
    companyId,
    userId,
    role: "assistant",
    sourcePostId: sourcePostId || agentResult.sourcePostId || undefined,
    message: agentResult.message,
    availableCommands: [],
  });
  this.broadcast(userId, event);
  return event;
}
```

- [ ] **Step 4: Run assistant tests**

Run:

```powershell
npm test -- matching-assistant.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit routing**

```powershell
git add -- prometheus-backend/src/matching/matching-assistant.service.ts prometheus-backend/src/matching/matching-assistant.service.spec.ts
git commit -m "feat: route matching console prompts through agent commands"
```

---

## Task 5: Frontend Verification And Small Copy Cleanup

**Files:**

- Modify only if needed: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify only if needed: `prometheus/src/app/features/workspace/workspace.component.spec.ts`

- [ ] **Step 1: Verify existing frontend event rendering**

Confirm that backend `matchingAssistantEvent` messages appear in Matching Console through:

```ts
handleMatchingAssistantEvent(event: MatchingAssistantEvent): void
```

No UI rewrite is needed if assistant messages already render cleanly.

- [ ] **Step 2: Add test only if UI copy changes**

If copy changes, add a focused test that sends a mock event with:

```ts
{
  role: "assistant",
  message: "I found 3 hazmat loads out of Memphis from the last 5 hours.",
  availableCommands: [],
}
```

Expected: the Matching Console contains that message without adding unwanted buttons.

- [ ] **Step 3: Run frontend tests around workspace**

Run:

```powershell
npm test -- --include src/app/features/workspace/workspace.component.spec.ts --watch=false
```

Expected: PASS.

- [ ] **Step 4: Commit frontend adjustments if any**

```powershell
git add -- prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.spec.ts
git commit -m "chore: keep matching console event copy clean"
```

Skip commit if no frontend files changed.

---

## Task 6: End-To-End Local QA

**Files:**

- No source files expected.

- [ ] **Step 1: Run backend tests**

```powershell
npm test -- hazmat-match-classifier.spec.ts agent-command-parser.spec.ts agent-command.service.spec.ts matching-assistant.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

```powershell
npm run build
```

Expected from `C:\Prometheus-Clean\prometheus`: PASS.

- [ ] **Step 4: Manual app QA**

Using the current local app:

1. Log in as carrier owner or dispatcher.
2. Type `anything out of Memphis from the last 5 hours under 44000 pounds`.
3. Confirm Prometheus replies with deterministic search results or a useful no-result message.
4. Type `show me only partial shipments out of Houston, TX under 30 feet`.
5. Confirm filters are honored.
6. Type `show me a map with loads around my truck in Houston TX`.
7. Confirm the assistant returns map-ready guidance or opens the existing route/load panel if that UI is already wired.
8. Post matching Chicago to Memphis broker/carrier records and confirm automatic match notices appear.
9. Confirm `book option 1` still uses the existing booking path.

- [ ] **Step 5: Final checkpoint commit**

If all tasks passed and the worktree has remaining intended changes:

```powershell
git status --short
git add -- <changed files>
git commit -m "feat: add Prometheus agent command router phase 1"
```

---

## Plan Self-Review

Spec coverage:

- One visible agent surface: covered by Task 4 and existing Matching Console.
- Deterministic backend source of truth: covered by Task 3 service using Mongo and existing records.
- Natural search commands: covered by Tasks 2 and 3.
- Alternatives by weight/equipment/city/date/partial: first slice covers weight, city, age, length, and capacity; richer route-through alternatives move to Company Memory/Alternatives plan.
- Map/route panel: first slice detects map intent and can return map-ready guidance; full panel implementation stays with the existing route intelligence plan.
- Company memory: intentionally deferred to Phase 2 plan.
- External actions require approval: unchanged; Task 4 routes booking commands to existing approval flow instead of natural-search handler.
- Local and cloud model boundary: not changed in this slice; existing ChatBB runtime remains as-is.

Placeholder scan:

- No task uses TBD/TODO/FIXME.
- Each code-changing task includes exact files, code snippets, commands, and expected results.

Type consistency:

- Parser returns `ParsedAgentCommand`.
- Service returns `AgentCommandResult`.
- Assistant service consumes `AgentCommandResult.handled`, `message`, and optional metadata only.
