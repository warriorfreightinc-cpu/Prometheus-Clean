# Booking Workflow Hardening Design

## Status

Approved by David on 2026-05-03.

This spec defines the next Prometheus slice after the Hazmat Hero matching core. The goal is to make Booking Chat behave like the real operating desk: Prometheus asks questions in the chat, the user answers with typed replies or buttons, and the booking only moves forward when the required human actions are complete.

## Goal

Booking Chat should guide a dispatcher through a hazmat booking after a broker and carrier match is accepted:

1. Confirm or reject the booking offer.
2. Generate the live load only after both sides approve.
3. Stage broker setup.
4. Assign a driver and truck.
5. Save the broker contact into Main Chat.
6. Start tracking through ELD/API or MacroPoint.
7. Mark delivered.
8. Send the completed load to Loads Console only after delivery is green.
9. Cancel the load at any time, with TONU/waiting state when needed.

The UI should feel like a guided chat, not a form board. The left buttons are state controls. The chat is where Prometheus explains what is happening and asks the next question.

## Current State

The code already has the important foundation:

- Booking Chat lives in `prometheus/src/app/features/workspace/workspace.component.*`.
- The backend persists booking approval through room `bookingStatus`, broker approval, and carrier approval.
- `LoadsService.createFromRoom` refuses to create a load until the room is booked.
- Booking Chat already has local workflow state for setup, driver, tracking, and delivered.
- There are frontend tests around approval, setup provider choice, driver choice, tracking, delivery, contact save, and send-to-load-console visibility.

The next work should harden and clean this existing flow instead of rebuilding it.

## User Experience

### Booking Approval

When a room is negotiating and no load exists, Prometheus shows an AI chat prompt:

> Prometheus has this hazmat booking ready. Approve booking or reject the offer?

The prompt has two actions:

- Approve booking
- Reject offer

The old confusing side text such as "Negotiating" should not be presented as the main decision. Status can still exist visually as a small state label, but the real action belongs in the AI chat.

When one side approves, Prometheus says that approval is saved and it is waiting for the other side. When both sides approve, Prometheus creates or reveals the live load in Booking Chat.

### Left-Side State Buttons

The Booking Chat left-side buttons use red/green readiness:

- `Get setup`: red until a setup provider is selected. Clicking it asks in chat which provider to stage: Highway, MyCarrierPacket, or Truckstop.
- `Assign driver`: red until a driver/truck is assigned. Clicking it shows available drivers and trucks in chat and lets the user select one.
- `Add contact`: red until the broker/contact is saved. Clicking it saves the counterparty into Main Chat and moves the user there.
- `Track`: red until tracking is shared. Clicking it asks whether to connect ELD/API or send MacroPoint.
- `Delivered`: red until confirmed. Clicking it asks for confirmation, then marks delivered.
- `Cancel load`: always red. Clicking it asks whether the cancellation is waiting on TONU/accessorials or should cancel/remove the load now.
- `Send to Loads Console`: hidden or disabled until delivered is green. When clicked, it moves the user to Loads Console with the completed load context.

### Chat Behavior

Every button should create a clear Prometheus message in the booking chat. The dispatcher should understand why the state changed and what to do next.

Typed replies continue to work for the active prompt:

- Setup provider prompt accepts Highway, MyCarrierPacket, or Truckstop.
- Driver prompt accepts driver name or truck label.
- Tracking prompt accepts yes/no or provider/token text.
- Delivered prompt accepts yes/no.
- Cancellation prompt accepts TONU/waiting or cancel/remove.

## Data Rules

### Persisted Now

These states are real business/legal states and must remain backend-backed:

- Booking approval by broker.
- Booking approval by carrier.
- Booking status: negotiating, booked, cancelled, delivered where supported.
- Live load creation from a booked room.
- Load status movement to active, library, readyToBill, or archived.

### Local For This Slice

These can remain local workflow state in this slice, but should be cleanly isolated so backend persistence can be added later:

- Setup provider selected.
- Driver and truck selected before load creation.
- Tracking provider selected.
- Tracking shared flag.
- Contact saved in Main Chat local store.

The implementation should not make these harder to persist later.

## Button Behavior

### Get Setup

Clicking `Get setup` asks:

> Which setup provider should be staged for this booking?

Actions:

- Highway
- MyCarrierPacket
- Truckstop

Choosing one turns setup green and logs the result in chat.

### Assign Driver

Clicking `Assign driver` asks:

> Which driver and truck should I assign?

Actions come from the available driver roster. Choosing one turns driver green. If a live load already exists, the driver/truck is saved to the load through `LoadsApiService.updateLoad`.

### Add Contact

Clicking `Add contact` saves the selected room counterparty into the Main Chat contact list and switches the Direct Console view to Main Chat. The button turns green when the selected room already has a saved contact.

### Track

Clicking `Track` asks:

> Tracking is still red. Connect your ELD/API or send MacroPoint?

Actions:

- Connect ELD
- Send MacroPoint

`Send MacroPoint` immediately stages MacroPoint and turns tracking green. `Connect ELD` asks for provider/token input, then asks whether tracking should be shared. Tracking turns green only after the user allows it.

### Delivered

Clicking `Delivered` requires a live load. If no live load exists, Prometheus explains that the booking must first become a live load. If a live load exists, Prometheus asks for confirmation. Confirming delivery moves the load to `readyToBill` and turns delivered green.

### Cancel Load

Cancel is always available and visually red. If no live load exists, Prometheus should tell the user to reject/cancel approval instead. If a live load exists, Prometheus asks whether this is waiting on TONU/accessorials or should cancel now.

- Waiting on TONU moves the load to `library`.
- Cancel now removes the active load through the existing delete endpoint.

### Send To Loads Console

This action only becomes available after delivered is green and the live load exists. It switches the user to Loads Console and opens the ready-to-bill view.

## Error Handling

- If the room is not booked, load creation shows a clear message and does not call the load API.
- If driver assignment fails on an existing load, the chat state should not claim the backend saved it.
- If cancellation fails, the load remains visible and the user sees an error.
- If delivery fails, the delivered button remains red.
- If no room is selected, all state buttons are disabled.

## Testing

Frontend tests should cover:

- Booking approval prompt shows only the clear AI question and actions.
- Approve booking creates the live load only when the backend says the room is booked.
- Reject offer cancels booking approval and does not create a load.
- Setup provider choice turns setup green.
- Driver choice turns driver green and updates the live load when one exists.
- Track shows ELD/MacroPoint choices and MacroPoint turns tracking green.
- Delivered requires a live load and moves an active load to ready-to-bill only after confirmation.
- Send to Loads Console is unavailable until delivered is green.
- Cancel load handles both TONU/library and cancel-now removal paths.
- Add contact moves the counterparty into Main Chat.

Verification commands:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```

## Out Of Scope

This slice does not add:

- Real Highway/MyCarrierPacket/Truckstop API integrations.
- Real ELD/API or MacroPoint integration.
- Stripe payments.
- DigitalOcean deployment.
- Full backend persistence for setup provider, driver selection, tracking provider, or saved contact.

Those are later production-hardening slices.

## Acceptance Criteria

This slice is complete when:

- Booking Chat is the clear guided workflow for approval, setup, driver, contact, tracking, delivery, and cancellation.
- The buttons behave according to their labels.
- Red/green readiness reflects the actual current state.
- A live load is generated only after both broker and carrier approve.
- Delivered is required before Send to Loads Console appears or works.
- The focused frontend tests and Angular build pass.
