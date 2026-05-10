# PromethAIs Process Plan

This file is the working summary for what already exists, what still needs to be built, and the recommended build order.

## 1. Clean workspace rule

Use only:
- `C:\Prometheus-Clean\prometheus`
- `C:\Prometheus-Clean\prometheus-backend`

## 2. What already exists

- A separate PromethAIs frontend and backend workspace.
- Onboarding UI with company and document upload flow.
- Auth and session endpoints.
- Company status and document resource endpoints.
- Dispatch Posting Console shell.
- AI Load/Truck Matching Console shell.
- Loads Console shell with active, library, and ready-to-bill direction.
- Direct Chat Console layouts for booking chat, main chat, and company chat.
- Matching backend foundation with route and score snapshot logic.
- Routing abstraction foundation in the backend.
- Basic booked-load creation and update flow in the backend.

## 3. Target business flow

The intended product flow is:

1. Company onboarding
- Company signs up.
- Required documents are uploaded.
- Admin reviews and approves the company.
- Users are assigned roles.

2. Posting
- Dispatcher posts truck or load in natural language.
- System extracts required structured fields.
- Missing fields are requested before post creation.
- Post is saved with history and expiration rules.

3. Matching
- Matching runs immediately after post creation.
- Deterministic filters return valid candidates.
- Deadhead, trip miles, and total miles are calculated.
- Results are ranked and saved in match snapshots.
- AI explains the results, but does not replace the scoring engine.

4. Main chat
- Dispatcher works broker conversations and offers.
- Broker and carrier exchange rates and availability.
- Prometheus keeps offer history as structured offer records.
- If both sides want to proceed, the room moves into booking flow.

5. Booking chat
- Booking confirmation happens with timeout and approval rules.
- Setup flow is completed if needed.
- Driver is assigned.
- Contact is saved if needed.
- Tracking is requested and approved.
- Cancellation and TONU logic are handled here.

6. Loads Console
- Confirmed loads move into active loads.
- Load record shows broker, driver, load number, lane, tracking state, and load status.
- Accessorials, detention, lumper, and TONU need structured capture.
- Team visibility and access requests need to work.

7. Delivery and documents
- Load is marked delivered.
- BOL and required delivery documents are attached and matched to the load.
- Missing document states are clearly visible.

8. Billing
- When the packet is complete, the load moves to ready-to-bill.
- Billing export or billing email send is triggered.
- After successful billing handoff, the load is archived.

## 4. What still needs to be built

### Onboarding and approval

- Admin approval queue UI.
- Company verification rules for MC, hazmat, insurance, and authority.
- Role assignment flow for admin, dispatcher, carrier desk, broker desk, and manager.
- Invite flow for company users.
- Document expiration and renewal reminders.

### Posting

- Final natural-language parser confirmation loop.
- Real Excel import.
- Real PDF or screenshot intake.
- TMS import placeholder replacement with actual connector contract.
- Post event history and expiration.

### Matching

- Automatic match snapshot generation right after post creation or update.
- UI display of deadhead miles, trip miles, total miles, ETA, and route fit.
- Filters for today, tomorrow, last 20 hours, and radius.
- Live refresh when new candidate posts appear.
- Better deterministic scoring rules by equipment, weight, hazmat, freshness, distance, and route fit.

### Main chat

- Structured offers and counters, not only raw messages.
- Broker chooses carrier through a real booking state.
- Booking timeout and approval window.
- Notification state for new broker responses.

### Booking chat

- Real booking state machine.
- Setup provider integration path for Highway, MyCarrierPackets, and Truckstop.
- Driver assignment persistence before and after load creation.
- Tracking approval and provider state.
- Cancellation logic with TONU handling.
- Delivery confirmation logic.

### Loads Console

- Full active load detail cards.
- Team visibility and access request flow.
- Manager override flow.
- Load notes and issue states.
- Waiting on accessorials or missing paperwork states.

### Tracking and external providers

- ELD integration first.
- MacroPoint support.
- 4Kites support.
- Tracking-required billing rule if broker requires tracking.

### BOL and billing

- BOL upload.
- Packet completeness rules.
- Billing send by email or TMS export.
- Archive after successful billing handoff.

## 5. Recommended implementation order

### Phase 1: simplest operational fixes

- Finish onboarding approval and user role flow.
- Tighten posting validation and required fields.
- Add post history and expiration.
- Wire automatic match snapshot creation after post creation.

### Phase 2: matching and offer control

- Add deterministic match filters and route metrics in the UI.
- Persist structured offers and counters.
- Add booking approval timeout logic.

### Phase 3: booking workflow

- Formalize booking chat state machine.
- Persist setup status.
- Persist assigned driver.
- Persist tracking approval.
- Persist cancellation, TONU, and delivery transitions.

### Phase 4: loads and documents

- Expand Loads Console active/library/ready-to-bill behavior.
- Add accessorial and issue states.
- Add BOL and packet upload rules.
- Add company access and takeover controls.

### Phase 5: billing

- Add billing-ready validation.
- Add billing email send or TMS export.
- Add archive after billing handoff.

### Phase 6: agents

- Posting agent:
  Natural language to structured post, missing-field questions only.

- Matching agent:
  Explains deterministic matches, ranks them, and drafts next actions.

- Booking or loads agent:
  Handles guided booking steps, setup prompts, tracking prompts, and delivery prompts.

- Direct chat drafting agent:
  Helps draft messages, but never confirms binding actions on its own.

## 6. Agent design rule

Do not make AI the source of truth for matching or load state.

Use AI as the operator on top of deterministic backend logic.

That means:
- Matching logic belongs to backend services.
- State changes belong to backend services.
- AI should explain, ask, guide, and draft.
- AI should not invent rates, book loads by itself, or change billing state without a real backend action.

## 7. Best deployment approach

### First production version

Recommended:
- Browser frontend
- Backend API on a server
- Managed database
- Managed file storage
- Hosted AI behind the backend

Reason:
- Fastest to stabilize
- Lower operational risk
- Easier to support multiple users

### Second production version

Later, if needed:
- Replace hosted AI with self-hosted model endpoint
- Keep the same backend contracts
- Keep agents server-side, not desktop-side

Reason:
- Better privacy and cost control later
- Not worth doing before the workflow is stable

## 8. Practical next step

The next best development step is:

1. Finish onboarding approval and company verification.
2. Wire match snapshot generation into post creation.
3. Build the real booking state machine.

That is the safest order because it locks the business flow before external integrations and before full AI automation.
