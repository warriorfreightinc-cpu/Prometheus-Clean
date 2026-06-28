# Prometheus Brain Pro And Bring Your Own AI Design

## Status

Approved direction by David on 2026-06-28.

This spec extends Prometheus Brain V1 into **Prometheus Brain Pro**: a stronger, paid-model-capable assistant layer that can use company-approved AI providers while Prometheus remains the operating system for freight tools, approvals, data isolation, and audit history.

The core idea is not to make users abandon the AI tools they already understand. Prometheus should connect them safely. Advanced users may bring their own OpenAI API key or future agent configuration, while dispatchers and brokers can still use Prometheus as a practical daily assistant without needing to understand AI infrastructure.

## Product Goal

Prometheus should become the transportation command center where AI can help users navigate a large amount of freight information:

- loads, trucks, lanes, broker/carrier contacts, route context, setup, tracking, memory, and written history;
- company-specific rules and preferences;
- external AI providers chosen by the company;
- future user-created assistants or ChatGPT companion workflows.

Prometheus Brain Pro should feel more capable than Brain V1 in three ways:

1. It can use stronger cloud reasoning models for complex operations.
2. It can plan multi-step transportation work and call Prometheus tools.
3. It can support company-owned AI configuration without giving AI uncontrolled authority.

## Product Principle

AI can reason, suggest, draft, search, and prepare.

Prometheus controls execution.

That means the model may propose a tool call, but Prometheus decides:

- whether the user is allowed to use the tool;
- whether company settings allow that provider or action;
- whether the action requires human approval;
- what exact payload is stored in the audit trail;
- whether an external side effect is actually performed.

This keeps the product open and powerful without letting an outside agent book freight, send messages, share tracking, or change company state on its own.

## User Modes

### 1. Prometheus-Managed Brain Pro

The company uses AI through Prometheus' configured backend provider.

Use cases:

- early staging;
- companies that do not want to manage API keys;
- demo environments;
- future subscription tiers.

Behavior:

- Prometheus chooses the approved model;
- cost controls live in Prometheus;
- all prompts, tool calls, approvals, and outcomes are logged;
- no user sees provider secrets.

### 2. Bring Your Own AI Key

A company admin can add an OpenAI API key or compatible provider key in Company Setup.

Use cases:

- advanced customers already paying for OpenAI API access;
- companies that want their own billing relationship;
- privacy-conscious customers who want their own provider account;
- teams that want stronger models for only their company.

Behavior:

- key is stored encrypted on the backend;
- only company admins can add, rotate, test, or remove the key;
- the key is never returned to the frontend;
- the company can set model, budget limit, allowed tools, and fallback mode;
- Prometheus still applies role checks, approval gates, and audit logging.

Important distinction:

- A normal ChatGPT login is not an API key for Prometheus.
- Brain Pro should support API keys first.
- ChatGPT account/connector workflows belong to the later ChatGPT Companion path.

### 3. Future ChatGPT Companion

Later, Prometheus can expose an official companion experience so a user can talk to Prometheus from ChatGPT or another agent surface.

Use cases:

- "Ask Prometheus what loads need attention today."
- "Ask Prometheus to draft emails for these five brokers."
- "Ask Prometheus for route risk on the Memphis load."
- "Ask Prometheus what needs my approval."

Behavior:

- ChatGPT or another agent asks Prometheus through a controlled connector/app boundary;
- Prometheus returns company-authorized data only;
- any real action still creates an approval inside Prometheus;
- Prometheus remains the audit system.

This path should not replace the in-app Brain. It should extend Prometheus into the places advanced users already work.

## Brain Pro Architecture

### 1. AI Provider Gateway

Add a backend gateway that owns all model calls.

Responsibilities:

- select company provider mode: prometheus-managed, company-owned key, local fallback, or disabled;
- choose model by task class;
- apply cost and rate limits;
- sanitize provider errors;
- keep provider credentials server-side;
- return structured model output to the Brain orchestrator.

Recommended task classes:

- `simple`: greeting, short answer, command clarification;
- `classification`: intent and tool selection;
- `reasoning`: multi-step freight planning;
- `drafting`: email/chat/dispatch copy;
- `visionImport`: future OCR/image load-list extraction;
- `fallback`: deterministic response when provider is unavailable.

### 2. Brain Pro Orchestrator

Upgrade the current `PrometheusBrainService` into a tool-using orchestrator.

Responsibilities:

- receive prompt and workspace context;
- classify user intent;
- load permitted company memory and current operational context;
- decide whether deterministic rules are enough or a model is needed;
- request one or more internal tool calls;
- produce a clear assistant response;
- create approval requests for risky actions;
- write Brain events for prompt, plan, tool use, approval, and result.

The orchestrator should support multi-step plans, but each tool call remains typed and bounded.

Example:

User: "Find me something for Nate out of Chicago, under 44k, and ask the best broker for 2800."

Prometheus plan:

1. Search company truck context for Nate.
2. Search matching loads out of Chicago.
3. Filter under 44,000 lb.
4. Rank by lane, rate, route fit, setup/tracking readiness.
5. Draft broker message asking for $2,800.
6. Create approval request before sending.

Only steps 1-5 can happen automatically. Step 6 waits for human approval.

### 3. Tool Registry

Prometheus tools should be explicit backend functions with schemas.

Initial Brain Pro tools:

- `searchLoads`
- `searchTrucks`
- `postLoadDraftFromText`
- `postTruckDraftFromText`
- `parseCsvOrTextLoadList`
- `routeIntelligence`
- `matchRanker`
- `draftBrokerEmail`
- `draftCarrierEmail`
- `draftChatMessage`
- `createBookingApproval`
- `requestTrackingApproval`
- `requestSetupApproval`
- `lookupCompanyMemory`
- `requestMemorySave`
- `listPendingApprovals`
- `explainAuditTrail`

Later tools:

- `parseImageLoadList`
- `parsePdfLoadList`
- `importFromTms`
- `openProviderLoadSearch`
- `prepareProviderBooking`
- `monitorTrackingRisk`
- `generateBillingPacket`

Tool outputs must separate:

- facts from Prometheus data;
- model suggestions;
- missing data;
- approval-required next actions.

### 4. Approval Boundary

Brain Pro must keep the V1 approval rule.

Approval-required actions:

- sending email;
- sending broker/carrier chat;
- placing or accepting bids;
- starting or confirming booking;
- requesting or sharing tracking;
- sending setup packets;
- dispatching or assigning driver;
- marking delivered;
- moving load to billing or archive;
- saving company memory;
- changing company/provider/billing settings.

Approval records must include:

- company id;
- user id and role;
- provider mode used for suggestion;
- model id when applicable;
- action type;
- exact payload;
- risk note;
- source prompt;
- status and execution result.

### 5. Company AI Settings

Company Setup should eventually include an AI section.

Fields:

- provider mode: `prometheusManaged`, `companyOpenAi`, `local`, `disabled`;
- API key status: `missing`, `connected`, `failed`, `rotating`;
- selected reasoning model;
- selected economy model;
- monthly token or dollar budget;
- daily request limit;
- allowed Brain tools;
- allow future external companion access;
- memory mode;
- audit retention days.

The frontend should never display secret values. It can show connection status, last test time, and masked key fingerprint.

### 6. Cost Control

Brain Pro needs cost boundaries before production use.

Recommended controls:

- use economy model for simple prompts and classification;
- use strong reasoning model only for complex plans;
- cap response length;
- cache safe static answers when practical;
- log token estimates or provider usage when available;
- company-level monthly budget;
- admin-visible usage summary;
- fallback to deterministic answers when budget is exceeded.

User-facing behavior:

- do not expose raw token math to dispatchers;
- tell admins when Brain Pro is paused by budget;
- keep basic deterministic Prometheus functions working even when paid AI is unavailable.

## Data Isolation

Every Brain Pro request must be scoped to one company.

The AI provider may receive only the minimum context needed for the task:

- user role;
- current prompt;
- relevant load/truck/route records;
- approved company memory;
- tool output summaries.

The provider must not receive:

- API keys;
- passwords;
- unrelated company data;
- full database dumps;
- billing secrets;
- private counterpart data not intentionally shared in the workflow.

## Future User-Created Agents

Prometheus can later support advanced users who build their own agents.

Safe path:

- users create agents outside Prometheus or in a future agent builder;
- Prometheus exposes controlled tools through an app/connector boundary;
- each tool requires company authorization;
- risky actions return approval requests instead of executing;
- all tool calls are logged.

Prometheus should not allow arbitrary user code or unrestricted agents to run inside the production backend in the first version.

This keeps the door open for advanced AI users without making Prometheus unsafe for normal dispatch operations.

## Implementation Phases

### Phase 1: Provider Gateway Foundation

- Add backend AI provider gateway.
- Support current local OpenAI-compatible runtime.
- Support cloud OpenAI API key mode.
- Add company provider mode data model.
- Add sanitized provider health check.
- Keep deterministic fallback.

### Phase 2: Brain Pro Orchestrator

- Add structured planning output.
- Add tool-call schema.
- Route search/map/draft/approval intents through the orchestrator.
- Keep current parser as a safety fallback.
- Add tests proving risky actions do not execute without approval.

### Phase 3: Company AI Settings UI

- Add AI provider section to Company Setup.
- Let admins choose provider mode.
- Let admins enter/rotate/test API key.
- Show model, status, budget, and fallback settings.
- Never return raw secrets to frontend.

### Phase 4: Tool Expansion

- Add text/CSV import as a Brain tool.
- Add route intelligence tool.
- Add draft email/chat tools.
- Add approval-list and audit-trail tools.
- Add memory lookup/save request tools.

### Phase 5: Cost And Audit Visibility

- Add provider usage events.
- Add monthly/daily limits.
- Add admin usage summary.
- Add clear pause/fallback behavior when limits are reached.

### Phase 6: ChatGPT Companion Research And Prototype

- Design official companion/app connector boundary.
- Expose read-only Prometheus tools first.
- Add approval-request creation tools second.
- Keep execution inside Prometheus.

## Testing Strategy

Backend tests:

- company provider mode selection;
- API key never appears in responses;
- provider failure falls back safely;
- simple prompt uses economy path;
- complex prompt uses reasoning path;
- tool schema rejects invalid payloads;
- role checks block unauthorized tools;
- email/chat/booking/tracking/setup actions create approvals only;
- company data never crosses company boundaries;
- budget exceeded disables paid calls but preserves deterministic tools.

Frontend tests:

- AI settings form masks secrets;
- provider test status displays clearly;
- non-admin users cannot manage AI provider settings;
- Brain Pro responses render tool results and approval cards;
- budget/provider unavailable states are understandable;
- existing matching, booking, loads console, and direct chat flows still work.

Manual QA:

- configure local provider;
- configure company OpenAI key;
- ask simple greeting;
- ask complex lane/match/rate prompt;
- draft but do not send email;
- create booking approval;
- exceed test budget and confirm fallback;
- remove provider key and confirm deterministic Prometheus still works.

## Success Criteria

Brain Pro is successful when:

- Prometheus can use a stronger paid AI model for complex freight reasoning;
- companies can bring their own AI key safely;
- admins can control model, budget, tools, memory, and fallback mode;
- AI can plan multi-step work using Prometheus tools;
- risky freight actions always stop at approval;
- every important prompt, plan, tool call, approval, and execution result is logged;
- normal dispatch users get a helpful assistant without needing to understand AI setup;
- advanced users have a path toward custom agents and ChatGPT companion workflows.

## Out Of Scope For This First Build

- full ChatGPT companion implementation;
- arbitrary user-created agent runtime inside Prometheus;
- model fine-tuning;
- autonomous booking;
- unsupervised provider booking;
- live OCR/image parsing unless added as a later tool;
- legal hazmat compliance certification;
- exposing provider credentials to frontend users.

## Design Decision

Build Prometheus Brain Pro as a backend-owned orchestration layer with company-configurable AI providers.

Start with OpenAI API key support and local fallback inside the existing Nest backend. Defer the ChatGPT Companion and user-created agent ecosystem until the provider gateway, tool registry, approval gates, data isolation, and usage controls are solid.

This gives Prometheus the future-facing platform David described: not another isolated app, but a safe transportation operating layer where AI, company data, provider tools, and human approval work together.
