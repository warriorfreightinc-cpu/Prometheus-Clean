# Operations Core Matching And Booking Design

## Status

Approved approach: Option C, Operations Core Milestone.

This spec defines the next production-critical slice before Stripe and DigitalOcean. The goal is to make Prometheus usable for the real broker/carrier operating workflow:

company approved -> users active -> post load or truck -> ranked matching -> direct room -> chat and bid -> human booking confirmation -> load created -> setup/tracking/delivery/billing state.

## Current Project State

The codebase already has important pieces:

- Posting exists for broker loads and carrier trucks.
- Direct rooms exist through `MessagesService`.
- Load records can be created from a room through `LoadsService.createFromRoom`.
- ChatBB exists and can use OpenAI or an OpenAI-compatible local runtime.
- A stronger backend `MatchingService` exists, with snapshots, route/deadhead metrics, and scores.

The main gap is that these pieces are not fully connected as one reliable operating flow. The frontend still mostly uses older search endpoints for matches, rooms do not have a clear booking lifecycle, and AI suggestions are not consistently tied to explicit human-approved actions.

## Scope

This milestone finishes the operating core only. Stripe production billing and DigitalOcean deployment are intentionally after this.

In scope:

- Real matching agent API and frontend wiring.
- Match snapshot persistence and display.
- Booking lifecycle for direct rooms.
- Human approval gates for booking actions.
- ChatBB action drafts connected to real UI actions.
- Load creation only from confirmed booking rooms.
- Load lifecycle polish from active to delivered/library to ready to bill to finished.
- Smoke-testable broker and carrier demo flow.

Out of scope for this milestone:

- Real Stripe subscription activation.
- DigitalOcean server deployment.
- Real external Highway/MyCarrierPacket/Truckstop integrations.
- Real ELD/tracking API integration.
- Real accounting export or invoice automation.

## Recommended User Flow

1. Broker or carrier posts a load/truck from Dispatch Posting Console.
2. Matching Console automatically selects the new posting and requests a ranked backend match snapshot.
3. Matching results show score, lane, deadhead, equipment, weight, freshness, rate fit, and a concise reason.
4. User clicks or types `open match 1`.
5. Prometheus creates or opens a direct room for the matched broker/carrier pair.
6. Direct Chat Console supports messages and bids.
7. ChatBB can draft messages, counteroffers, and next steps.
8. User explicitly confirms booking. No AI action books without the user.
9. Confirmed booking locks the room pair into a booked state and creates or exposes a load record.
10. Booking chat handles staged setup, driver assignment, tracking status, cancellation, delivery, and billing readiness.

## Architecture

### Backend

Add a small Matching controller around the existing `MatchingService`:

- `POST /matching/snapshots`
  Creates a snapshot for the selected post.

- `GET /matching/snapshots/latest`
  Returns the latest snapshot for a post.

The controller should validate ownership and role:

- Brokers can create snapshots for their broker posts.
- Carriers can create snapshots for their carrier posts.
- Managers/admins can create snapshots for company posts if they are allowed to see that company data.

Extend direct room persistence with booking lifecycle fields:

- `bookingStatus`: `open`, `negotiating`, `booked`, `cancelled`, `delivered`
- `bookingConfirmedAt`
- `bookingConfirmedBy`
- `bookingRate`
- `bookingNotes`
- `loadId`

Add booking endpoints on the messages or loads side:

- `PATCH /messages/room/booking`
  Updates room booking status with human action metadata.

- `POST /loads/from-room`
  Stays the load creation endpoint, but refuses to create the load unless the room is booked or the request includes a confirmed booking action.

The `LoadsService` keeps ownership and duplicate-load protection.

### Frontend

Refactor the matching display so it consumes backend match snapshots instead of raw search results:

- Existing Matching Console remains the user surface.
- Results become ranked match cards with score and reasons.
- Commands still work, but cards also have clear buttons.
- Opening a match creates or loads the direct room.

Direct Chat Console gains booking state controls:

- Open/negotiating status.
- Confirm booking action.
- Cancel booking action.
- Create/open load once booked.
- Visual status on selected room.

Booking chat becomes the guided execution surface after booking:

- Setup provider staged locally.
- Driver selected locally.
- Tracking staged locally.
- Delivered moves load to library or ready-to-bill depending on user action.
- Finished archives the load.

### ChatBB Actions

ChatBB remains an assistant, not an autonomous dispatcher.

It may produce structured suggested actions:

- Draft message.
- Draft counteroffer.
- Recommend open match.
- Recommend confirm booking.
- Recommend assign driver.
- Recommend mark delivered.
- Recommend move ready to bill.

Every action that changes data requires user approval in the UI.

If AI runtime fails, the built-in fallback still provides safe suggestions using available context.

## Data And State Rules

### Matching

A match snapshot is immutable once created. New refresh creates a new snapshot.

Each candidate should include:

- matched post id and post type
- score
- score breakdown
- lane summary
- equipment
- weight
- rate if available
- origin deadhead miles
- destination deadhead miles
- trip miles
- total practical miles
- reason text derived from score breakdown

### Booking

Room status transitions:

- `open` -> `negotiating`
- `open` -> `booked`
- `negotiating` -> `booked`
- `open` or `negotiating` -> `cancelled`
- `booked` -> `delivered`

Rules:

- A booked room cannot be booked again.
- A cancelled room cannot create a load.
- Creating a load from a room is idempotent.
- Only users connected to the room, company admin, manager, or supervisor can change booking state.
- ChatBB cannot directly change booking state.

### Loads

Load lifecycle:

- `active`
- `library`
- `readyToBill`
- `archived`

Meaning:

- `active`: booked and being worked.
- `library`: delivered or cancelled work waiting on paperwork or decision.
- `readyToBill`: billing can start.
- `archived`: finished and no longer active.

## Error Handling

Matching:

- Missing source post returns not found.
- Unauthorized post access returns forbidden.
- No matches returns an empty snapshot with status ready and clear UI copy.
- Routing provider failure falls back to existing available distance fields and marks route provider as fallback/null.

Booking:

- Duplicate booking returns the existing booked room state.
- Attempt to create load from unbooked room returns a clear conflict error.
- Attempt to book cancelled room returns conflict.
- Attempt to modify another company's room returns forbidden.

AI:

- Missing AI provider returns fallback plan.
- AI JSON parse failure returns fallback plan plus risk note.
- AI suggestions never auto-send messages or auto-book.

## Test Strategy

Backend tests:

- Matching controller ownership and role tests.
- Matching service score/reason tests.
- Room booking state transition tests.
- Load creation requires booked room.
- Load creation remains idempotent.
- ChatBB fallback and structured action parsing tests where needed.

Frontend verification:

- Angular build.
- Broker login can post load and see ranked carrier matches.
- Carrier login can post truck and see ranked broker matches.
- Open match creates direct room.
- Bid/message flow still works.
- Confirm booking creates or reveals load.
- Delivered and ready-to-bill state changes show in Loads Console.

Local smoke accounts:

- `broker.local@prometheus.test / Prometheus123!`
- `carrier.local@prometheus.test / Prometheus123!`
- `superadmin.local@prometheus.test / Prometheus123!`

## Delivery Slices

## Helper-Agent Execution Strategy

This milestone can use helper agents for small, controlled work packages. The lead agent stays responsible for architecture, task boundaries, review, integration, and verification.

Rules for helpers:

- Helpers get one bounded task at a time.
- Helpers must have clear file ownership.
- Helpers cannot make broad refactors.
- Helpers cannot change deployment, billing, secrets, or production config.
- Helpers cannot merge, commit to `main`, or restart production processes.
- Helpers must report changed files and verification output.
- Lead agent reviews every diff before integration.

Good helper tasks:

- Add focused backend unit tests.
- Add DTO/interface types.
- Add one controller around an existing service.
- Add one small frontend API wrapper.
- Add UI display for already-returned data.
- Write seed data or smoke-test scripts.

Tasks kept with the lead agent:

- Cross-module architecture.
- Booking state model decisions.
- Matching score semantics.
- ChatBB safety rules.
- Final integration.
- Final verification.
- Git merge and cleanup.

Recommended helper pattern:

1. Lead creates or updates the implementation plan.
2. Lead assigns one helper per independent slice.
3. Helpers work in isolated branches or worktrees when possible.
4. Lead reviews helper patches.
5. Lead runs the complete verification suite.
6. Lead commits only reviewed, passing work.

### Slice 1: Real Matching Agent Wiring

Expose backend matching snapshots through API endpoints and connect the frontend Matching Console to snapshot results.

Estimate: 4 to 7 hours.

### Slice 2: Booking Lifecycle

Add room booking state, confirm/cancel actions, and enforce load creation only from booked rooms.

Estimate: 5 to 8 hours.

### Slice 3: ChatBB Action Approval

Make AI recommendations actionable but approval-gated in the UI.

Estimate: 4 to 7 hours.

### Slice 4: Load Lifecycle Polish

Tighten active, library, ready-to-bill, and archived movement so the booking process feels complete.

Estimate: 4 to 6 hours.

### Slice 5: End-To-End Smoke And Cleanup

Seed data, live local verification, fix awkward UI handoffs, and update docs.

Estimate: 3 to 5 hours.

## Practical Estimate

Operations core milestone:

- Best case: 2 working days.
- Safer estimate: 3 to 4 working days.

After this milestone:

- Stripe production billing: 1 to 2 working days.
- DigitalOcean staging deployment: 1 to 2 working days.
- Safer production hardening: another 2 to 4 working days.

## Acceptance Criteria

This milestone is done when:

- A broker can post a load, see ranked truck matches, open a room, negotiate, confirm booking, and create a load.
- A carrier can post a truck, see ranked load matches, open a room, negotiate, confirm booking, and create a load.
- Matching results come from persisted snapshots, not only raw ad hoc search.
- Every booking-changing action is user-approved.
- ChatBB can suggest next steps without inventing unavailable data.
- Loads Console reflects booked, delivered/library, ready-to-bill, and archived states.
- Backend tests and Angular/Nest builds pass.
