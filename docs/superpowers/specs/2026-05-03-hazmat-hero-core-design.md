# Hazmat Hero Core Design

## Status

Approved direction: build Prometheus around a real-time hazmat dispatcher assistant, not a traditional load board.

This spec defines the first Hazmat Hero core slice: when a broker posts or imports a hazmat load, or a carrier posts or imports a hazmat truck, Prometheus automatically ranks usable matches, suggests near-fit options, asks the right party for permission when an equipment or schedule substitution might work, and only moves to booking after humans approve.

## Product Goal

Prometheus should act like a hazmat transportation assistant with deep operating discipline:

- find the safest and fastest truck/load fit;
- reduce manual refresh, phone calls, and missed opportunities;
- keep the user in a conversation instead of a spreadsheet;
- protect both sides with explicit approval before booking;
- treat hazmat freight as the primary business, with non-hazmat fallback only when hazmat options are not useful.

The assistant should feel like "Hazmat Hero inside Prometheus": it watches the board, reads posted or imported freight, understands equipment and operational constraints, suggests options, asks permission, and keeps moving down the list until the dispatcher or broker has a practical next step.

## Current Project State

Prometheus already has useful pieces:

- broker load posting and carrier truck posting;
- older local prototype notes for posting and search behavior;
- current backend matching snapshots in `C:\Prometheus-Clean\prometheus-backend\src\matching`;
- direct rooms and booking status fields in `MessagesService`;
- a chat-first Matching Console that should remain the primary AI surface;
- a Booking Chat workflow with setup, driver, contact, tracking, delivered, and cancel actions.

The missing core is the glue: posting/importing should automatically trigger matching, the match should create assistant messages for both sides, and near-match logic should be smart enough to suggest real hazmat alternatives instead of only saying "no match."

## Core Principles

### Hazmat First

Prometheus is a hazmat-first system.

Strict hazmat matches come first. Hazmat near-matches come second. Permission-based hazmat substitutions come third. Non-hazmat alternate work is shown only when hazmat options are not useful and must be clearly labeled as alternate work.

### Deterministic Facts, AI Conversation

The matching engine owns facts, scoring, and eligibility. The AI layer owns explanation, suggestion language, and guided next steps.

The model may say:

> No exact RZ reefer hazmat match is available. I found 3 VZ van hazmat loads that may work if the broker allows a reefer trailer. Do you want me to ask about option 1?

The model must not invent:

- a load that was not imported or posted;
- a broker approval that did not happen;
- a rate or pickup time not present in the data;
- a booking confirmation without both humans approving.

### Human Approval

Prometheus can recommend, ask, draft, and open the approval flow. It cannot book freight by itself.

Booking requires both sides to approve through the existing booking confirmation flow. If one side rejects, the assistant returns to the next viable option.

### Conversation First

The Matching Console should not become a column/grid load board.

The assistant should show ranked suggestions as chat messages with short numbered options. The user can type natural commands such as:

- `ask about 1`
- `offer 3000 on option 2`
- `show the next two`
- `book it`
- `skip this one`

Small quick actions are out of scope for this slice unless they simply mirror typed commands without changing the conversation-first workflow.

## Input Data

Prometheus should normalize every posted or imported load/truck into a shared matching shape.

### Load Inputs

- source: manual post, spreadsheet/PDF import, TMS/API import, broker API feed
- broker company and user
- origin city/state and pickup radius
- destination city/state and delivery radius
- pickup date/time window
- delivery date/time window
- equipment code such as V, VZ, R, RZ, F, FZ
- hazmat requirement and hazmat class if present
- commodity/product type
- weight
- length if present
- rate if present
- broker setup/contact requirements
- notes from the broker or imported payload

### Truck Inputs

- source: manual post, spreadsheet/PDF import, TMS/API import
- carrier company and user
- truck origin/current location
- destination preference, lane preference, or open destination
- availability date/time
- equipment code such as V, VZ, R, RZ, F, FZ
- hazmat certification
- max weight
- driver/truck identifier if present
- preferred rate or minimum rate if present
- hours/availability notes if present
- carrier setup/contact/tracking readiness

## Match Tiers

The assistant should rank matches by tier before scoring inside each tier.

### Tier 1: Strict Hazmat Match

A strict match means:

- both sides are hazmat compatible;
- equipment is directly compatible;
- load weight is within truck capacity;
- pickup/delivery windows fit;
- origin/destination are within configured deadhead/radius limits;
- commodity does not conflict with known restrictions.

Assistant behavior:

> I found a strong hazmat match for your Chicago truck. Option 1 is a VZ load from Chicago, IL to Memphis, TN, 42,000 lb, pickup today, posted by Brooke Broker. Want me to ask for booking or make an offer?

### Tier 2: Hazmat Near Match

A hazmat near match is still hazmat freight, but one constraint is flexible:

- lower weight than requested;
- nearby city instead of exact city;
- next-day pickup instead of today;
- similar destination market;
- slightly different rate/miles profile;
- equipment may be compatible but needs confirmation.

Assistant behavior:

> No exact 44,000 lb match is available. I found 5 hazmat loads at 41,000 lb with better rates. Option 1 pays more and stays near your preferred lane. Want me to ask about option 1 or show the next two?

### Tier 3: Permission-Based Hazmat Substitution

This tier is for hazmat moves that might work only if the other party agrees.

Examples:

- truck is RZ reefer hazmat, available load is VZ van hazmat;
- load says VZ but may be safe on RZ if broker accepts reefer equipment;
- pickup is a few hours later than requested;
- delivery is one day later but the rate is better.

Assistant behavior:

> I do not have a clean RZ match. I found a VZ hazmat load that may work if the broker allows reefer equipment. Do you want me to ask the broker if option 1 can move on RZ?

If the user says yes, Prometheus sends the counterpart a clear AI message:

> A carrier has an RZ reefer hazmat truck available for your VZ hazmat load. Can this load move safely on reefer equipment?

If the counterpart rejects or times out, the assistant returns to the next option:

> The broker declined reefer equipment for option 1. Option 2 is another VZ hazmat load with better timing. Want me to ask about option 2?

### Tier 4: Hazmat Market Alternatives

This tier appears when there are no useful exact or near matches.

Examples:

- different destination with better hazmat freight density;
- next-day pickup instead of today;
- lower weight but higher rate;
- nearby origin city with stronger opportunities.

Assistant behavior:

> I do not see a strong hazmat match from Chicago right now. Nearby Joliet and Gary have better hazmat coverage. I found 4 options with stronger rates. Want me to show those or keep watching Chicago?

### Tier 5: Non-Hazmat Fallback

This tier is last and must be clearly labeled.

It appears only when:

- no useful hazmat option exists;
- the user's company settings allow alternate freight suggestions;
- the assistant labels the result as non-hazmat alternate work;
- the user chooses to review it.

Assistant behavior:

> Hazmat options are weak right now. I can show non-hazmat alternate work near this truck, but it will be labeled outside the hazmat board. Do you want to see those options?

## Guided Suggestion Flow

The assistant should not dump every possible match at once.

Default behavior:

1. Show the best option and one-line reason.
2. Ask what action the user wants.
3. If the option requires permission, ask whether to contact the other side.
4. If the option fails, show the next best option.
5. If the user asks for more, show the next two or three options.
6. If all good hazmat options fail, suggest market alternatives.

Example flow:

1. Carrier posts: "Truck in Pittsburgh, PA, ready now, RZ reefer hazmat, wants Chicago."
2. Prometheus finds no strict RZ load.
3. Prometheus finds three VZ hazmat loads that may work if broker accepts reefer.
4. Carrier sees: "No exact RZ match. Option 1 is VZ hazmat Pittsburgh to Chicago, 40,000 lb, $2,800. Want me to ask if reefer is accepted?"
5. Carrier says: "ask about 1."
6. Broker sees: "A carrier has RZ reefer hazmat equipment for your VZ hazmat load. Can this load move on reefer?"
7. Broker says yes or no.
8. If yes, both sides continue toward offer/booking.
9. If no, carrier assistant suggests option 2.

## Cross-Account Notifications

Posting or importing should trigger matching without manual refresh.

Events:

- broker load created;
- carrier truck created;
- imported broker load created;
- imported carrier truck created;
- load/truck updated;
- load/truck removed or expired.

For each event, Prometheus should:

1. normalize the source post;
2. run the matcher against the opposite side;
3. persist match opportunities;
4. write a system AI message into the posting company's Matching Console;
5. notify the counterpart only when the posting party asks to test, offer, or book the candidate.

This prevents spam while still making the assistant proactive.

## Booking Handoff

The Matching Console is for finding and negotiating fit. Booking Chat is for executing an agreed booking.

The handoff should work like this:

1. Assistant suggests a match.
2. User asks Prometheus to make an offer, test permission, or book.
3. Counterpart accepts the fit or offer.
4. Prometheus opens a booking confirmation modal for both sides.
5. The modal has a five-minute timer, `Approve booking`, and `Reject offer`.
6. If both approve, Prometheus creates or opens the booking room.
7. The booked load appears in Booking Chat.
8. Booking Chat manages setup, driver, contact, tracking, delivery, cancellation, and load console handoff.

If either side rejects, no load is created. The assistant returns to the next suggested option.

## Data Model Additions

### MatchOpportunity

Create or extend persisted matching records with:

- `sourcePostType`: `brokerLoad` or `carrierTruck`
- `sourcePostId`
- `candidatePostType`
- `candidatePostId`
- `tier`: `strictHazmat`, `hazmatNearMatch`, `hazmatPermission`, `hazmatMarketAlternative`, `nonHazmatFallback`
- `score`
- `scoreBreakdown`
- `hazmatCompatible`
- `equipmentCompatibility`: `exact`, `compatible`, `requiresPermission`, `incompatible`
- `permissionQuestion`
- `permissionStatus`: `notNeeded`, `notAsked`, `asked`, `accepted`, `rejected`, `expired`
- `status`: `suggested`, `skipped`, `negotiating`, `approvedForBooking`, `booked`, `rejected`, `expired`
- `createdAt`
- `updatedAt`

### Assistant Conversation Event

Persist assistant events so both UI and tests can inspect them:

- `conversationId`
- `companyId`
- `userId`
- `role`: `assistant`, `user`, `system`
- `message`
- `relatedOpportunityId`
- `availableCommands`
- `createdAt`

The `availableCommands` are machine-readable actions behind natural conversation. They are not automatic execution.

## AI Runtime Strategy

Use the LLM for language and reasoning over already-ranked facts, not as the source of matching truth.

The assistant prompt should receive:

- current user role and company;
- source post summary;
- ranked opportunity list;
- tier explanations;
- allowed commands;
- safety rules.

The assistant output should include:

- user-facing message;
- suggested next command labels;
- risk notes if important;
- no hidden data-changing action.

If OpenAI, LM Studio, or another provider is unavailable, Prometheus should use deterministic fallback templates so matching still works.

## TMS And External Feed Strategy

Manual posting and TMS/API import should feed the same normalized matching pipeline.

Potential source types:

- Prometheus manual post;
- spreadsheet/PDF extraction;
- broker TMS import;
- carrier TMS import;
- partner API such as a broker hazmat feed;
- future board/API sources where permission exists.

External data rules:

- only import or display data the company is authorized to access;
- keep source attribution on every load/truck;
- preserve source IDs for update/delete sync;
- do not convert non-hazmat freight into hazmat freight;
- if a broker feed only marks V or R, Prometheus may infer possible VZ/RZ only when a hazmat flag or commodity supports it.

## Error Handling

No strict match:

- create a clear assistant message with near-match options if available.

No hazmat options:

- show hazmat market alternatives before non-hazmat fallback.

Permission request rejected:

- mark opportunity rejected;
- tell the requesting user;
- suggest the next candidate.

Permission request timeout:

- mark opportunity expired;
- suggest the next candidate or keep watching.

AI provider unavailable:

- use deterministic fallback copy.

Duplicate booking attempt:

- return the existing booked room or current approval state.

Counterpart no longer available:

- mark opportunity expired and explain that the load/truck is no longer active.

## Test Strategy

Backend tests:

- strict hazmat match ranks above near matches;
- RZ truck to VZ load creates `requiresPermission`;
- rejected permission request causes the next option to be suggested;
- non-hazmat fallback is hidden until hazmat options are exhausted;
- event-driven post creation creates match opportunities without manual refresh;
- duplicate source/candidate pair does not create duplicate active opportunities;
- booking is not created until both sides approve.

Frontend tests:

- Matching Console remains conversation-first;
- new posting creates an assistant message with the best match;
- `ask about 1` sends the permission question to the counterpart;
- rejection displays the next option;
- approval handoff opens booking confirmation;
- booked approval opens/creates the Booking Chat load.

Manual smoke flow:

1. Sign in as broker and post a VZ hazmat load.
2. Sign in as carrier and post an RZ hazmat truck.
3. Confirm carrier receives a permission-based suggestion.
4. Carrier asks Prometheus to ask broker about reefer.
5. Broker accepts.
6. Carrier asks to book.
7. Both sides approve in the five-minute modal.
8. Load appears in Booking Chat.

## Non-Goals For This Slice

This slice does not finish:

- real Stripe billing;
- DigitalOcean production deployment;
- real ELD or MacroPoint API integration;
- real Highway/MyCarrierPackets API integration;
- full rate intelligence from paid market data;
- every TMS connector.

It creates the core operating pattern those later integrations will plug into.

## Acceptance Criteria

The first implementation is successful when:

- posting a load or truck automatically creates ranked hazmat opportunities;
- the Matching Console receives an assistant message without manual refresh;
- exact hazmat matches are suggested before near matches;
- RZ/VZ and similar equipment substitutions are treated as permission questions;
- the user can choose which option to ask about;
- rejection moves the assistant to the next candidate;
- both sides can reach booking approval from the assistant flow;
- no booked load is created until both sides approve.
