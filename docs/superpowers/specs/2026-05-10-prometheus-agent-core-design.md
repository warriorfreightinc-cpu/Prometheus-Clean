# Prometheus Agent Core Design

## Status

Approved direction by David on 2026-05-10.

This spec defines the next layer above the current Hazmat Hero matching work: one visible Prometheus transportation agent that can post, search, match, suggest, map, email, and guide booking while using many controlled helper tools behind the scenes.

The goal is not to replace the existing posting, matching, booking, route, and company setup logic. The goal is to put a smart dispatcher/broker assistant on top of those systems so the user can work naturally:

- "Post Nate in Chicago for Friday."
- "Do you have anything out of Memphis from the last 5 hours?"
- "Only show partials under 30 feet."
- "Do not show James anything over 44,000 lb."
- "Show me a map of loads around my Houston truck."
- "Email Brian my truck list, but let me approve it first."

## Current Project State

Prometheus already has the core pieces needed for this direction:

- Manual broker and carrier posting.
- A chat-first AI Load/Truck Matching Console.
- Backend matching snapshots and match opportunities.
- Hazmat compatibility and near-match logic.
- Booking Chat with setup, driver, contact, tracking, delivered, and cancel actions.
- Route intelligence panel design.
- Company integrations design for TMS, ELD, tracking, and broker setup providers.
- ChatBB, which can use a local OpenAI-compatible runtime through LM Studio or a cloud OpenAI runtime later.

Current environment notes:

- Local AI is configured through `OPENAI_BASE_URL=http://127.0.0.1:1234/v1`.
- Current local model label is `prometheus-local`.
- Cloud OpenAI can be enabled later by replacing the local base URL with an OpenAI API key and model.

The current Matching Console is not yet a true general trucking agent. It is mostly deterministic matching logic with assistant messages. This spec upgrades it into the main Prometheus agent surface.

## Product Goal

Prometheus should feel like a real transportation operator sitting next to the dispatcher or broker:

- It knows hazmat freight first.
- It watches posted and imported loads/trucks automatically.
- It remembers company and dispatcher preferences.
- It suggests practical alternatives when the exact match is not available.
- It can show map and route intelligence.
- It can draft emails and messages.
- It can ask counterparties permission questions.
- It can prepare booking, tracking, and dispatch steps.
- It never performs binding or risky actions without human approval.

The assistant should be broad in transportation knowledge but controlled in execution.

## Approaches Considered

### Approach A: Keep Forms And Rules Only

Prometheus would keep separate post/search forms and deterministic matching.

Pros:

- Least risky technically.
- Easier to test.
- Fast to stabilize.

Cons:

- Does not match the product vision.
- Still feels like a load board with chat added.
- Dispatcher has to know what to search for instead of being assisted.

### Approach B: One Fully Open AI With No Restrictions

Prometheus would pass all user text to an LLM and let it decide what to do.

Pros:

- Feels powerful in demos.
- Fast to prototype.

Cons:

- Too risky for freight, rates, booking, tracking, billing, and compliance.
- Can invent facts.
- Can mix company data if memory is not isolated.
- Hard to audit legally.
- Hard to prove why a load was booked or rejected.

### Approach C: One Visible Agent With Controlled Tools

Prometheus exposes one assistant to the user, but all real actions happen through approved backend tools.

Pros:

- Matches the product vision.
- Keeps backend data as source of truth.
- Lets Prometheus learn preferences safely.
- Supports local LM Studio and cloud OpenAI behind the same interface.
- Allows many specialist helpers without confusing the user.
- Keeps human approval for legal and financial actions.

Cons:

- Requires a clear agent/tool architecture.
- Must be built in phases.
- Needs tests around tool permissions and company isolation.

Recommendation: Approach C.

## Core Principle

One visible AI, many hidden helpers.

The user should feel like they are talking to Prometheus. Internally, Prometheus can call specialized helpers:

- posting helper;
- matching helper;
- route and map helper;
- rate helper;
- driver and ELD helper;
- compliance helper;
- email helper;
- booking helper;
- tracking and security helper;
- company memory helper.

These helpers are not separate user personalities. They are tools controlled by the Prometheus agent.

## Source Of Truth

AI is not the source of truth.

Prometheus backend services own:

- load records;
- truck records;
- company records;
- user permissions;
- driver records;
- match scoring facts;
- booking status;
- tracking status;
- billing/load console status;
- email send records;
- audit history.

The agent owns:

- conversation;
- interpretation;
- suggestions;
- explanations;
- asking follow-up questions;
- drafting messages;
- choosing which backend tool to request next.

## Human Approval Rules

Prometheus can suggest many things freely, but these actions require explicit human approval:

- sending an email;
- sending a broker/carrier chat message outside the user company;
- placing a bid or counteroffer;
- accepting a bid;
- confirming booking;
- canceling a load;
- sharing tracking;
- dispatching a driver;
- marking delivered;
- moving a load to billing or archive;
- changing company billing or subscription.

The approval record must include:

- who approved;
- company and role;
- timestamp;
- action type;
- exact action payload;
- target load/truck/booking if applicable.

## Agent Architecture

### 1. Agent Orchestrator

New backend service:

- `PrometheusAgentService`

Responsibilities:

- receive user prompt and current workspace context;
- identify intent;
- load safe company context;
- select the right helper tool;
- return a conversational answer;
- optionally return an action request for approval;
- write an agent event/audit record.

This service should be model-provider neutral. It can use:

- local OpenAI-compatible runtime through LM Studio;
- cloud OpenAI later;
- deterministic fallback when no model is available.

### 2. Tool Registry

Each real capability is exposed as a backend tool with strict inputs and outputs.

Initial tools:

- `postTruckFromText`
- `postLoadFromText`
- `searchLoads`
- `searchTrucks`
- `rankMatches`
- `showNearbyLoadMap`
- `showRouteIntelligence`
- `draftEmail`
- `requestCounterpartyPermission`
- `prepareBookingApproval`
- `openBookingChat`
- `assignDriver`
- `requestTracking`
- `markDelivered`

Tools should validate permissions before doing anything. The model can ask to call a tool, but the backend decides whether it is allowed.

### 3. Company Memory

New memory layer, stored in MongoDB, scoped by company and user.

Memory should not be model fine-tuning at first. It should be structured data:

- max preferred weight;
- preferred lanes;
- blocked lanes;
- preferred brokers/carriers;
- blocked companies;
- rate expectations by lane;
- equipment preferences;
- driver endorsements;
- driver restrictions;
- repeated user commands;
- accepted/rejected suggestions.

Example:

If the dispatcher says "do not show James loads over 44,000 lb," Prometheus stores that as a driver preference, not just chat history.

### 4. Conversation Events

Every agent response should be stored as an event:

- user prompt;
- detected intent;
- tools considered;
- tool actually called;
- model/provider used;
- result summary;
- approval required or not;
- source records used;
- timestamp.

This gives auditability and helps debug wrong suggestions.

## Helper Responsibilities

### Posting Helper

Turns user text, spreadsheet rows, PDFs, or TMS/API records into structured posts.

Examples:

- "Post Nate in Chicago ready Friday, 53 van hazmat, max 44k."
- "Post this PDF load list."
- "Import today's C.H. Robinson hazmat feed."

Behavior:

- extract city, state, equipment, date, weight, commodity, rate, driver/truck;
- ask only for missing required fields;
- save structured post through existing post services;
- trigger matching after successful post.

### Matching Helper

Finds and explains matches.

Matching criteria:

- hazmat compatibility;
- equipment compatibility;
- weight and length;
- pickup date/time;
- delivery date/time;
- origin deadhead;
- destination fit;
- rate/RPM;
- driver/company preferences;
- broker/carrier relationship;
- setup and tracking readiness.

Default limit:

- show up to 20 matches first;
- ask if the user wants to see more.

Example:

> I found 8 hazmat options from Memphis in the last 5 hours. The best 3 are under 44,000 lb and within 70 miles. Want to review option 1, ask for a better rate, or see the next 5?

### Alternative Suggestion Helper

When no exact match exists, Prometheus suggests practical alternatives:

- lower weight;
- nearby pickup city;
- later pickup date;
- partial load;
- route-through opportunity;
- alternate equipment permission, such as asking if a VZ van hazmat load can ride on RZ reefer hazmat equipment;
- non-hazmat fallback only after hazmat options are not useful.

Example:

> No exact RZ hazmat load is open for Houston right now. I found 6 VZ hazmat loads nearby. Do you want me to ask the brokers whether reefer hazmat equipment is acceptable?

### Map And Route Helper

Supports map-style questions:

- "Show loads around my Houston truck."
- "Show me a load map."
- "What are deadhead and loaded miles?"
- "Show route for option 1."

Phase 1:

- show a Prometheus route/load cluster panel using available location and matching data;
- group nearby loads by city;
- show counts like Houston 50, Baytown 5, Pasadena 1;
- show truck marker and candidate load clusters;
- use fallback miles when live map provider is not connected.

Phase 2:

- add Google Maps display when provider key is configured;
- add Google route alternatives when provider is configured;
- keep fallback panel when Google is not available.

### Rate Helper

Suggests financial context without inventing unavailable market data.

Inputs:

- posted rate;
- miles;
- company lane history;
- accepted/rejected rates;
- configured market integrations later;
- fuel/toll estimates when providers are connected.

Output:

- suggested rate range;
- RPM;
- fuel/toll estimate status;
- confidence label.

If live market data is not connected, Prometheus must say the estimate is based on company/local history or fallback assumptions.

### Driver And ELD Helper

Uses connected ELD or manual driver data.

Examples:

- driver is still at delivery;
- driver is not moving;
- pickup appointment risk;
- HOS risk;
- missing tanker endorsement;
- driver historically cannot take tanker loads.

Example:

> James is still near the delivery location and pickup is at 3:00 PM. This may become a late pickup. Want me to warn the broker or look for a later pickup option?

### Compliance Helper

Checks hazmat-specific requirements:

- hazmat authority;
- insurance;
- driver hazmat endorsement;
- tanker endorsement when commodity/equipment suggests it;
- equipment compatibility;
- paperwork/setup gaps.

It should advise, not certify legal compliance.

Example:

> This looks like a tanker hazmat opportunity. James does not have tanker listed in his driver profile. Please confirm before offering this truck.

### Email Helper

Drafts and sends emails only after approval.

Examples:

- "Email Brian and ask if he has anything out of Colorado."
- "Send my Chicago truck list to these 20 brokers."

Behavior:

- draft message;
- show recipients;
- show subject/body;
- require approval;
- send through configured mail provider;
- store sent record;
- optionally include Prometheus footer.

Footer example:

> Sent with Prometheus, the hazmat-first transportation assistant.

### Booking Helper

Handles approval flow after both sides show interest.

Behavior:

- tell counterpart an offer or interest exists;
- ask for approval in the chat;
- open confirmation window with timer;
- require both sides to accept;
- create or open booking chat only after both sides approve;
- store legal audit details.

### Tracking And Security Helper

After tracking is connected:

- show current truck location;
- compare with expected route;
- detect long stops outside assumptions;
- detect route deviation;
- warn about pickup/delivery risk;
- alert carrier and broker with advisory wording.

Example:

> Tracking risk detected. Truck has been stopped away from the expected route longer than the configured threshold. Please verify driver status.

## User Experience

The Matching Console becomes the main Prometheus agent surface.

It should remain conversation-first:

- no traditional load board grid as the main view;
- no unnecessary buttons inside the AI answer;
- text input stays the primary control;
- optional approval panels appear only when a real action needs approval;
- map/route panel opens as a supporting window when the user asks for visual context.

The old post form can remain available for manual users, but the preferred path becomes natural language posting.

Example flow:

1. Dispatcher types: "Post Nate in Chicago ready Friday, 53 van hazmat, max 44k."
2. Prometheus extracts details and asks one missing question if needed.
3. Prometheus creates the truck post.
4. Prometheus automatically searches matching hazmat loads.
5. Prometheus says: "I found 12 options. Best is Chicago to Memphis, 42k, $2,500. Want me to ask for booking or show map?"
6. Dispatcher says: "Ask for $2,800."
7. Prometheus drafts the offer and asks for approval.
8. After approval, Prometheus sends the offer to the broker side.
9. Broker accepts or counters through their Prometheus agent.
10. Both sides confirm booking.
11. Booking Chat opens.

## Data Boundaries

Each company has isolated memory and data.

The agent may use:

- public load/truck fields needed for matching;
- counterpart fields intentionally exposed through the matching/booking flow;
- company-owned preferences;
- company-owned driver/truck data;
- company-owned integrations.

The agent must not expose:

- private broker lists to carriers;
- private carrier driver details to brokers unless approved;
- internal company preferences to counterparties;
- API credentials;
- billing data outside the owning company and superadmin flows.

## Model Strategy

Prometheus should support both local and cloud AI.

### Local Mode

Use LM Studio or another OpenAI-compatible local server.

Pros:

- easier local testing;
- lower variable cost;
- good privacy story for early demos.

Limits:

- weaker tool reasoning depending on model;
- harder structured output reliability;
- user must keep local model running.

### Cloud OpenAI Mode

Use OpenAI API through the backend.

Pros:

- stronger reasoning and tool use;
- better future fit for agent workflows;
- easier production deployment;
- better traces/evals later.

Limits:

- requires API key and billing;
- must keep all keys server-side;
- cost controls are required.

The backend should hide model choice behind one provider interface so the same Prometheus tools work with either mode.

## Phased Delivery

### Phase 1: Agent Command Router

Upgrade the Matching Console command handler:

- recognize broad natural-language search commands;
- route matching/map/posting commands without ChatBB;
- keep deterministic matching as source of truth;
- support queries like:
  - "anything out of Memphis?"
  - "last 5 hours"
  - "under 44k"
  - "only partials"
  - "show more"
  - "show map"

### Phase 2: Company Memory V1

Add structured memory:

- company preferences;
- dispatcher preferences;
- driver preferences;
- accepted/rejected suggestion history.

Use memory in matching and assistant explanations.

### Phase 3: Natural-Language Posting

Add text-to-post flow:

- extract structured load/truck fields;
- ask for missing required fields;
- create post through existing backend services;
- trigger automatic matching.

### Phase 4: Map Cluster Panel

Add load/truck cluster panel:

- truck marker;
- nearby load counts by city;
- route metrics;
- deadhead and loaded miles;
- fallback provider labels;
- Google Maps later behind configuration.

### Phase 5: Approval-Based External Actions

Add safe outbound actions:

- email drafting and approval;
- counteroffer drafting and approval;
- counterpart permission questions;
- booking approval handoff.

### Phase 6: Integrations And Security Monitoring

Connect provider data:

- TMS/API load feeds;
- ELD driver location/status;
- MacroPoint/FourKites/TQL tracking;
- Google Routes/Maps;
- fuel/toll providers if chosen.

Then add route deviation and stopped-too-long alerts.

## Testing Strategy

Backend tests:

- intent routing does not call unauthorized tools;
- company memory is isolated by company;
- natural-language search filters map to deterministic queries;
- "last 5 hours" limits by posted timestamp;
- weight and partial filters are honored;
- map command returns panel state, not invented map data;
- approval-required actions return action requests instead of executing directly;
- fallback mode works when no model provider is running.

Frontend tests:

- Matching Console stays conversation-first;
- search commands produce assistant responses;
- map commands open route/load panel;
- approval panel appears for real external actions;
- no existing Booking Chat buttons are moved or renamed;
- user sees clear provider-unavailable messages when AI/map/tracking providers are offline.

Manual end-to-end tests:

- Carrier posts a truck by natural language.
- Broker posts a load manually.
- Prometheus notifies both sides.
- Dispatcher asks for only under-44k options.
- Dispatcher asks for a map around truck.
- Dispatcher asks Prometheus to email a broker, approves draft, and send is recorded.
- Both sides approve booking and Booking Chat opens.

## Acceptance Criteria

- Prometheus has one main agent surface for matching/search/posting guidance.
- Existing posting logic remains available and is reused by the agent.
- Deterministic backend data remains source of truth.
- The agent can suggest load/truck alternatives by weight, equipment, city, date, partial/full, and route fit.
- The agent can open a map/route panel from a conversation command.
- Company and driver preferences can affect suggestions without leaking across companies.
- External actions require human approval.
- Local LM Studio and future cloud OpenAI can use the same provider boundary.
- The system remains usable when the model provider is offline by returning deterministic fallback guidance.
