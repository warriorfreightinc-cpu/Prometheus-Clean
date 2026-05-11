# Prometheus Brain V1 Design

## Status

Approved direction by David on 2026-05-11.

This spec upgrades the current Prometheus matching assistant into **Prometheus Brain**: one role-aware transportation assistant for carriers, dispatchers, brokers, and company admins. It combines natural conversation with controlled backend tools, human approval gates, consent-based company memory, and a written audit trail.

Prometheus Brain is not a replacement for the existing posting, matching, booking, route, tracking, company setup, and load console modules. It is the operating layer above them.

## Product Goal

Prometheus should feel like an experienced hazmat transportation assistant watching the work with the dispatcher or broker.

The Brain should help with:

- finding loads for trucks;
- finding trucks for loads;
- suggesting better hazmat alternatives when exact equipment, weight, date, or lane options are not available;
- answering transportation and hazmat operational questions;
- showing route, toll, fuel, mileage, and tracking context;
- finding nearby truck stops, tire shops, repair shops, washouts, or other driver support locations;
- drafting broker/carrier emails and chats;
- checking lane history and relationship history when memory is enabled;
- preparing booking, setup, tracking, dispatch, delivery, billing, and cancellation actions;
- keeping a written record of what was suggested, approved, sent, booked, rejected, or changed.

The Brain must help both sides of the industry. Carrier users and broker users have different tasks, but Prometheus should understand both daily workflows so it can connect them safely.

## Core Rule

Prometheus may search, calculate, explain, draft, recommend, and warn without changing outside state.

Prometheus must ask for human approval before it performs any action that creates legal, financial, operational, or communication responsibility.

Approval-required actions include:

- sending an email;
- sending a broker/carrier chat message;
- placing or sending a bid;
- sending a counteroffer;
- accepting a rate;
- starting booking approval;
- confirming booking;
- cancelling a load;
- requesting or sharing tracking;
- dispatching or assigning a driver;
- marking a load delivered;
- moving a load to billing, active archive, or cancelled status;
- saving company memory;
- changing company setup, billing, subscription, or access.

This keeps Prometheus useful without making the software responsible for unsupervised decisions.

## Written Trail Principle

Every important step must be traceable.

Prometheus should store an audit event for:

- user prompt;
- Brain interpretation;
- tool selected;
- data used when practical;
- suggestion returned;
- draft message produced;
- approval request created;
- approval or rejection by a user;
- action executed after approval;
- final result or failure.

Audit records should include:

- company id;
- user id;
- role;
- timestamp;
- source console or module;
- related load, truck, match, room, company, or contact;
- exact approved payload for external actions;
- resulting status when an action changes state.

The purpose is dispute protection and operational accountability: no "you told me" or "I forgot." The system should preserve the written trail.

## Role-Aware Brain

Prometheus Brain is one assistant, not separate personalities, but it must behave differently by role.

### Carrier / Dispatcher Mode

Carrier users should be able to ask:

- "Find Nate a hazmat load out of Chicago for Friday."
- "Do you have anything out of Memphis from the last five hours?"
- "Do not show James loads over 44,000 lb."
- "Show me only partials under 30 feet."
- "Can a reefer hazmat truck take this dry van hazmat load?"
- "Find the nearest truck stop from James."
- "Find a tire shop near the driver."
- "Show route avoiding tolls."
- "Will this pickup be late based on driver location?"
- "Email Brian my truck list and ask for anything out of CO."

The Brain should search loads, rank options, suggest alternatives, draft messages, warn about late pickup/delivery risk, and guide booking. It must ask before sending or booking.

### Broker Mode

Broker users should be able to ask:

- "Find trucks near Houston for this hazmat load."
- "Any carriers that can cover Memphis today?"
- "Is this carrier setup complete?"
- "Ask if this RZ load can move on VZ equipment."
- "Watch this driver, he is not moving toward pickup."
- "Show me nearby trucks posted in the last five hours."
- "Send setup packet."
- "Request tracking."
- "Show me the written approval trail for this booking."

The Brain should search trucks, rank carrier fit, ask safe permission questions, watch tracking/setup/driver readiness, and prepare booking approvals. It must ask before sending, confirming, or changing load state.

### Admin / Company Owner Mode

Company admins should be able to configure:

- company memory mode;
- storage mode;
- integrations;
- allowed provider tools;
- user access;
- role permissions;
- audit visibility;
- retention preferences.

Admins should not lose operational visibility. They can review Brain actions, approvals, memory entries, and company-wide audit history.

## Brain Architecture

### 1. Prometheus Brain Service

Add a backend service:

- `PrometheusBrainService`

Responsibilities:

- receive prompts from the AI Matching Console, Booking Chat, Direct Chat, Company Chat, or future universal command bar;
- identify user role and company context;
- classify intent;
- select a safe Brain tool;
- return a conversational answer;
- optionally return an approval request;
- write audit events.

The service should support deterministic rules first and model-assisted interpretation later.

Provider strategy:

- local LM Studio / OpenAI-compatible runtime for development;
- cloud OpenAI model optional later;
- deterministic fallback when no model is configured.

The model can help understand natural language, but backend tools remain source of truth.

### 2. Brain Tool Registry

Each capability should be a typed internal tool with strict input/output.

Initial Brain tools:

- `searchLoads`
- `searchTrucks`
- `rankMatches`
- `suggestEquipmentAlternatives`
- `answerHazmatQuestion`
- `showRouteIntelligence`
- `findNearbyService`
- `draftBrokerMessage`
- `draftCarrierMessage`
- `draftEmail`
- `startBookingApproval`
- `requestTracking`
- `assignDriverDraft`
- `recordHumanApproval`
- `saveMemoryRequest`
- `lookupCompanyMemory`

Tools should not directly bypass role checks. They must use existing services and permission rules.

### 3. Approval Requests

When the Brain wants to perform an approval-required action, it returns an approval request instead of executing.

Approval request fields:

- id;
- company id;
- user id;
- role;
- action type;
- label;
- plain-language summary;
- exact payload;
- risk note;
- expiration time when needed;
- status: pending, approved, rejected, expired, executed, failed.

Examples:

- "Approve sending this rate request email to CH Robinson?"
- "Approve asking the broker if VZ equipment can cover this RZ load?"
- "Approve starting booking confirmation for this carrier?"
- "Approve saving this memory: James prefers no loads over 42,000 lb?"

### 4. Brain Event Log

Add persisted Brain events separate from chat messages.

Recommended collection:

- `prometheusbrainevents`

Event types:

- `promptReceived`
- `intentClassified`
- `toolExecuted`
- `suggestionShown`
- `approvalRequested`
- `approvalAccepted`
- `approvalRejected`
- `actionExecuted`
- `memoryRequested`
- `memorySaved`
- `memoryDeleted`
- `error`

This event log is the written operational trail.

## Consent-Based Company Memory

Memory must be optional and company-controlled.

Prometheus must not silently save company preferences, driver notes, broker habits, lane history, rate behavior, legal instructions, or operational rules.

### Memory Modes

Each company chooses one memory mode.

#### 1. No Saved Memory

Prometheus can help inside the current session and use current visible records, but it does not save new learned preferences.

Examples:

- It can answer from a current load/truck.
- It can draft a message.
- It can search posted data.
- It cannot remember "James avoids 44,000 lb loads" after the session unless approved and memory is enabled.

#### 2. Company-Managed Memory

The company chooses to store memory in its own Prometheus company data and accepts responsibility for what it stores.

Examples:

- preferred max weight by driver;
- preferred brokers;
- lanes done for a year;
- typical broker contacts;
- driver endorsements;
- "avoid tolls" preference;
- company-specific setup instructions.

The UI must show that the company is responsible for stored content, review, deletion, and legal consequences.

#### 3. Managed Prometheus Storage

Later paid option. Prometheus provides managed storage, backups, retention controls, access controls, and support.

This should be a Stripe/billing feature later. Brain V1 only needs the data model and switches to support the path.

### Saving Memory

Prometheus must ask before saving memory.

Example:

> "Do you want me to remember that James prefers loads under 42,000 lb and avoids toll-heavy routes?"

The user can approve or reject. If approved, the memory entry stores:

- company id;
- created by user id;
- approved by user id;
- memory type;
- human-readable text;
- structured facts when available;
- source prompt or action;
- created date;
- last used date;
- retention/delete state.

### Memory Review

Company admins should eventually have a memory page showing:

- saved driver preferences;
- saved broker/carrier contact preferences;
- saved lane history notes;
- saved company rules;
- saved hazmat handling reminders;
- who approved each memory;
- edit/delete controls.

Brain V1 can start with backend memory records and simple admin-visible output later.

## Transportation Knowledge Scope

Prometheus Brain should cover practical transportation help, especially hazmat.

In Brain V1, answers should be conservative and clearly marked when external verification is needed.

Knowledge areas:

- hazmat equipment fit;
- hazmat compatibility questions;
- weight and equipment constraints;
- pickup/delivery date risk;
- driver/truck readiness;
- basic HOS awareness when ELD data exists;
- route/mileage/deadhead/load miles;
- toll/fuel estimates when provider data exists;
- truck stop/repair/tire shop lookup when location provider exists;
- broker setup/tracking packet workflow;
- lane history and broker relationship history when memory is enabled.

High-risk hazmat compliance answers must not pretend to be legal advice. Prometheus can say:

- what it knows from stored/company data;
- what should be checked;
- when to verify with official hazmat regulations or a compliance officer.

For production, exact legal disclaimer wording should be reviewed by an attorney.

## Route And Nearby Services

Prometheus should support questions like:

- "Find nearest truck stop from James location."
- "Find tire shop near driver."
- "Show route avoiding tolls."
- "Show deadhead and loaded miles."
- "What are the tolls and fuel cost?"
- "Show me alternate hazmat-safe routes."

Brain V1 should route these to route intelligence.

Provider phases:

1. Existing approximate route/mileage data and selected post/load context.
2. Google Maps/Routes or similar provider for live route and nearby place lookup.
3. Tracking provider location overlays from MacroPoint, FourKites, TQL tracking, or ELD.
4. Security alerts for route deviation, long stop, missed pickup risk, or suspicious movement.

If provider data is missing, Prometheus should say what is missing rather than invent precision.

## Lane History And Relationship Suggestions

When memory is enabled, Prometheus should use lane and contact history.

Example:

> "This lane has been covered with Brooke Broker for the last year, but CH Robinson has a similar available load. Do you want me to contact CH Robinson and ask for rate?"

The Brain can draft:

> "Hi, this is the AI assistant for Warrior Freight Systems. We are requesting a rate for a lane we have history on and can cover with hazmat capacity. Please confirm rate and details."

But it must ask before sending.

This feature needs:

- stored lane history;
- company contact records;
- broker/carrier contact preference;
- email/chat approval request;
- sent-message audit record.

## UI Surface

Brain V1 should keep the current chat-first matching console behavior.

Visible user surfaces:

- AI Matching Console: main Brain command surface for loads/trucks/search/match/route/rates.
- Booking Chat: Brain guides setup, driver, contact, tracking, delivered, cancel, and ready-to-bill.
- Direct Chat: Brain can draft but not send until approved.
- Company Setup: Brain can explain setup and integrations but cannot change billing or integrations without approval.

Future option:

- one universal command bar across the workspace.

## Safety And Responsibility Rules

Prometheus should never:

- book a load without human approval;
- send an external message without approval;
- change billing or subscription without approval;
- save memory without approval;
- mix memory between companies;
- expose one company's data to another company;
- invent live tracking, route, rate, toll, or legal data;
- present hazmat legal answers as guaranteed legal advice.

Prometheus should always:

- explain uncertainty;
- ask before risky action;
- log approvals;
- keep source-of-truth state in backend services;
- preserve company data isolation.

## Data Model Additions

### Company Brain Settings

Add fields under company:

```ts
brainSettings: {
  enabled: boolean;
  memoryMode: "none" | "companyManaged" | "prometheusManaged";
  allowModelLearning: boolean;
  allowedTools: string[];
  approvalRequiredActions: string[];
  retentionDays?: number | null;
}
```

Default:

- enabled: true;
- memoryMode: none;
- allowModelLearning: false;
- approvalRequiredActions: all risky actions;
- allowedTools: safe internal tools only.

### Brain Memory

New collection:

- `prometheusbrainmemories`

Fields:

- companyId;
- scope: company, user, driver, broker, carrier, lane, contact;
- subjectId;
- type;
- text;
- structuredFacts;
- sourceEventId;
- createdBy;
- approvedBy;
- createdAt;
- lastUsedAt;
- deletedAt;
- status: active, deleted.

### Brain Approval

New collection:

- `prometheusbrainapprovals`

Fields:

- companyId;
- requestedBy;
- approvedBy;
- role;
- actionType;
- summary;
- payload;
- status;
- expiresAt;
- executedAt;
- result;
- relatedIds;

### Brain Events

New collection:

- `prometheusbrainevents`

Fields:

- companyId;
- userId;
- role;
- source;
- eventType;
- prompt;
- intent;
- toolName;
- inputSummary;
- outputSummary;
- relatedIds;
- createdAt.

## Phased Implementation

### Phase 1: Brain Router Foundation

- Create `PrometheusBrainService`.
- Add prompt intent classification.
- Reuse current matching command parser and agent command service where practical.
- Add typed result format: answer, suggested actions, approval requests, route panel hints.
- Add tests for role-aware carrier and broker behavior.

### Phase 2: Approval And Audit

- Add approval request model/service.
- Add Brain event model/service.
- Log prompts, suggestions, approvals, and tool results.
- Route booking/message/email drafts through approval records.

### Phase 3: Consent Memory

- Add company Brain settings.
- Add memory records.
- Add save-memory approval flow.
- Add lookup of memory only for the same company and only when enabled.

### Phase 4: Transportation Tools

- Expand tools:
  - route intelligence;
  - nearby truck stops/shops;
  - hazmat compatibility question handler;
  - lane history lookup;
  - rate/rpm suggestion from available data;
  - draft email/chat actions.

### Phase 5: Provider Integrations

- Google Maps/Routes or alternative provider.
- MacroPoint/FourKites/TQL tracking.
- ELD provider location.
- Email provider send action.
- TMS/API load import.

### Phase 6: Security And Risk Monitoring

- Route deviation alerts.
- Long stop alerts.
- Missed pickup risk.
- Suspicious movement alerts.
- Broker/carrier shared tracking alerts.

## Testing Strategy

Backend tests:

- role-aware intent handling;
- no external action without approval;
- memory disabled means no saved memory;
- memory enabled still requires save approval;
- company isolation for memory and events;
- equipment alternative suggestions;
- hazmat answer uncertainty rules;
- approval execution logs exact payload;
- booking starts only through existing booking state services.

Frontend tests:

- chat-first Brain messages render correctly;
- approval request appears before risky action;
- rejecting approval does not execute;
- approving triggers correct API call;
- memory prompt appears before saving;
- booking buttons remain unchanged;
- route panel opens from Brain route/map prompts.

Manual QA:

- carrier asks for load search;
- broker asks for truck search;
- dispatcher asks for nearby tire shop;
- broker asks to request tracking;
- dispatcher approves email draft;
- company admin switches memory mode;
- Brain refuses to save memory when mode is none.

## Success Criteria

Brain V1 is successful when:

- carrier and broker users can use one assistant surface for practical transportation questions;
- the assistant can suggest hazmat equipment alternatives and operational next steps;
- risky actions always stop at an approval request;
- every approved/rejected action leaves a written trail;
- memory is off by default and consent-based when enabled;
- no company can see another company's memory or Brain events;
- existing booking, matching, direct chat, and setup flows remain stable.

## Out Of Scope For Brain V1

- fine-tuning a custom AI model;
- full legal hazmat compliance engine;
- real-time theft detection;
- live Google Maps production integration;
- live MacroPoint/FourKites/TQL polling;
- automatic email sending without approval;
- fully automated dispatch without human approval;
- production legal disclaimer final wording.

These are later phases after the Brain foundation, approval records, and consent memory are stable.

## Design Decision

Prometheus Brain V1 will use one role-aware assistant with controlled backend tools, approval-first actions, consent-based company memory, and a durable audit trail.

This is the safest way to create the transportation symbiosis: Prometheus helps everyone move faster, but humans remain responsible for decisions, approvals, and stored memory.
