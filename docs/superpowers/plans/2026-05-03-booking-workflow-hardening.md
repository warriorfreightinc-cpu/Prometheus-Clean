# Booking Workflow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Booking Chat the reliable guided workflow for approval, setup, driver assignment, contacts, tracking, delivery, cancellation, and Loads Console handoff.

**Architecture:** Keep backend-backed booking approval and load status as the source of truth. Keep setup provider, driver staging, tracking staging, and saved contacts local for this slice, but isolate them through existing `DirectRoomWorkflowState` helpers so they can be persisted later. Drive user decisions through AI chat prompts and action buttons, while the left-side buttons act as red/green state controls.

**Tech Stack:** Angular 16, Jasmine/Karma, RxJS, existing `WorkspaceComponent`, existing `MessagesApiService`, existing `LoadsApiService`.

---

## File Structure And Responsibilities

- Modify `prometheus/src/app/features/workspace/workspace.component.ts`
  - Tighten Booking Chat prompt text, button state logic, tracking prompt wording, cancellation flow, and delivered/load-handoff behavior.
  - Keep all operational side effects behind explicit user actions.
- Modify `prometheus/src/app/features/workspace/workspace.component.html`
  - Remove confusing approval strip decision controls from the booking card.
  - Keep the primary approve/reject decision inside the AI chat prompt.
  - Make state buttons disable/enable according to selected room and readiness.
- Modify `prometheus/src/app/features/workspace/workspace.component.scss`
  - Keep the status strip as a small passive state display if needed.
  - Preserve red/green button styling from existing classes.
- Modify `prometheus/src/app/features/workspace/workspace.component.spec.ts`
  - Add and tighten frontend behavior tests for the approved booking workflow.

## Current Useful Anchors

- `bookingAssistantEntries` builds the combined room and AI timeline.
- `bookingApprovalPromptEntry()` creates the AI approve/reject prompt.
- `bookingAssistantActionsForMessage()` maps active prompts to buttons.
- `runBookingAssistantAction()` executes button actions.
- `confirmSelectedBookingApproval()` updates backend booking approval and creates the live load only when the backend returns `bookingStatus: "booked"`.
- `createLoadFromSelectedRoom(true)` keeps the user inside Booking Chat after load creation.
- `selectedRoomSetupReady`, `selectedRoomDriverReady`, `selectedRoomContactReady`, `selectedRoomTrackingReady`, `selectedRoomDeliveredReady`, and `selectedRoomCanSendToLoadsConsole` drive the red/green buttons.

---

### Task 1: Keep Booking Approval Decision Inside AI Chat

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`

- [ ] **Step 1: Add the failing approval UI test**

In `prometheus/src/app/features/workspace/workspace.component.spec.ts`, add this test near the existing booking approval prompt test:

```ts
it('keeps booking approval controls inside the AI prompt instead of the sidebar decision strip', () => {
  const component = createComponent();
  component.user = userWithRole('broker');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

  const approvalEntry = component.bookingAssistantEntries.at(-1) as any;

  expect(approvalEntry.text).toBe('Prometheus has this hazmat booking ready. Approve booking or reject the offer?');
  expect(approvalEntry.actions.map((action: any) => action.label)).toEqual(['Approve booking', 'Reject offer']);
  expect(component.currentUserApprovedBooking(component.selectedRoom)).toBeFalse();
});
```

- [ ] **Step 2: Run the test and confirm it fails if the prompt wording or placement is wrong**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected before implementation: FAIL if the prompt text or action labels do not match exactly.

- [ ] **Step 3: Remove decision buttons from the booking side card**

In `prometheus/src/app/features/workspace/workspace.component.html`, replace this block:

```html
<div class="booking-state-strip" *ngIf="selectedRoom">
  <button
    class="secondary-button"
    type="button"
    (click)="confirmSelectedBookingApproval()"
    [disabled]="selectedRoom.bookingStatus === 'booked' || currentUserApprovedBooking(selectedRoom)"
  >
    Approve booking
  </button>
  <button
    class="secondary-button"
    type="button"
    (click)="cancelSelectedBookingApproval()"
    [disabled]="selectedRoom.bookingStatus === 'cancelled'"
  >
    Cancel approval
  </button>
</div>
```

with this passive state display:

```html
<div class="booking-state-strip" *ngIf="selectedRoom">
  <span>{{ bookingStatusLabel(selectedRoom) }}</span>
  <strong *ngIf="selectedRoom.brokerApprovedBooking">Broker approved</strong>
  <strong *ngIf="selectedRoom.carrierApprovedBooking">Carrier approved</strong>
</div>
```

- [ ] **Step 4: Add or verify the booking status label helper**

In `prometheus/src/app/features/workspace/workspace.component.ts`, make sure this public method exists near the selected-room getters:

```ts
bookingStatusLabel(room: DirectRoom | null | undefined): string {
  const status = room?.bookingStatus ?? 'negotiating';
  const labels: Record<string, string> = {
    negotiating: 'Approval pending',
    booked: 'Booked',
    cancelled: 'Cancelled',
    delivered: 'Delivered',
  };
  return labels[status] ?? 'Approval pending';
}
```

- [ ] **Step 5: Run the focused frontend test**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected: PASS for the workspace spec.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
Set-Location C:\Prometheus-Clean
git add prometheus/src/app/features/workspace/workspace.component.html prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.spec.ts
git commit -m "feat: keep booking approval in chat"
```

---

### Task 2: Harden Driver Assignment And Setup Actions

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`

- [ ] **Step 1: Add failing tests for setup and driver persistence behavior**

In `prometheus/src/app/features/workspace/workspace.component.spec.ts`, add these tests near the existing setup and driver tests:

```ts
it('updates an existing live load when assigning a driver from booking chat', () => {
  const updatedLoad = createLoad({
    driver: { name: 'Bob Carter', truckLabel: "Unit 401 / V 53'" },
  });
  const loadsApi = {
    updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
  };
  const component = createComponent({ loadsApi });
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
  component.loads = [createLoad({ status: 'active' }) as any];

  component.assignDriverToSelectedRoom((component as any).driverRoster[0]);

  expect(loadsApi.updateLoad).toHaveBeenCalledWith('load-1', {
    driverName: 'Bob Carter',
    truckLabel: "Unit 401 / V 53'",
  });
  expect(component.selectedRoomDriverReady).toBeTrue();
  expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Bob Carter');
});

it('keeps setup provider choices as explicit AI chat actions', () => {
  const component = createComponent();
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

  component.beginSetupAssist();

  const prompt = component.bookingAssistantEntries.at(-1) as any;
  expect(prompt.text).toBe('Which setup provider should be staged for this booking?');
  expect(prompt.actions.map((action: any) => action.label)).toEqual(['Highway', 'MyCarrierPacket', 'Truckstop']);
});
```

- [ ] **Step 2: Run the test and confirm it fails for current wording or load-update gaps**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected before implementation: FAIL if setup label still says `MyCarrierPackets` or driver update behavior does not match.

- [ ] **Step 3: Normalize setup provider labels**

In `prometheus/src/app/features/workspace/workspace.component.ts`, update `bookingAssistantActionsForMessage()` setup actions to:

```ts
case 'setupProvider':
  return [
    { type: 'chooseSetupProvider', label: 'Highway', value: 'highway' },
    { type: 'chooseSetupProvider', label: 'MyCarrierPacket', value: 'mycarrierpacket' },
    { type: 'chooseSetupProvider', label: 'Truckstop', value: 'truckstop' },
  ];
```

Update `beginSetupAssist()` to:

```ts
beginSetupAssist(): void {
  if (!this.selectedRoom) return;
  this.directSetupPickerOpen = false;
  this.directDriverPickerOpen = false;
  this.directTrackingConfirmOpen = false;
  this.directCancelConfirmOpen = false;
  this.bookingAssistantAction = 'setupProvider';
  this.appendBookingAssistantMessage('assistant', 'Which setup provider should be staged for this booking?');
}
```

Update the provider label in `chooseSetupProvider()` to:

```ts
const label = provider === 'highway'
  ? 'Highway'
  : provider === 'mycarrierpacket'
    ? 'MyCarrierPacket'
    : 'Truckstop';
```

- [ ] **Step 4: Keep driver assignment backend save honest**

In `assignDriverToSelectedRoom(driver: DriverRosterItem)`, keep the existing logic that stages driver locally before load creation and calls `loadsApi.updateLoad` when `selectedRoomLoad` exists. Ensure the success message appends the selected driver name:

```ts
next: (load) => {
  this.loads = this.loads.map((entry) => entry._id === load._id ? load : entry);
  this.loadMessage = `${driver.name} is assigned to ${load.reference}.`;
  this.appendBookingAssistantMessage('assistant', `${driver.name} is now assigned to ${load.reference}.`);
},
```

Ensure the error branch does not append success text:

```ts
error: (error) => {
  const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
  this.loadError = backendMessage || 'Prometheus could not save that driver assignment.';
},
```

- [ ] **Step 5: Run the workspace spec**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
Set-Location C:\Prometheus-Clean
git add prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.spec.ts
git commit -m "feat: harden booking setup and driver actions"
```

---

### Task 3: Tighten Tracking, Delivery, And Loads Console Handoff

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`

- [ ] **Step 1: Add failing tests for tracking and delivery guards**

In `prometheus/src/app/features/workspace/workspace.component.spec.ts`, add these tests near the existing tracking and delivery tests:

```ts
it('keeps delivered red and explains the missing live load when no load exists', () => {
  const component = createComponent();
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

  component.markSelectedBookingDelivered();

  expect(component.selectedRoomDeliveredReady).toBeFalse();
  expect(component.bookingAssistantEntries.at(-1)?.text).toContain('live load');
});

it('moves a live booking to ready-to-bill only after delivered confirmation', () => {
  const updatedLoad = createLoad({ status: 'readyToBill' });
  const loadsApi = {
    updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
  };
  const component = createComponent({ loadsApi });
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
  component.loads = [createLoad({ status: 'active' }) as any];

  component.markSelectedBookingDelivered();
  const prompt = component.bookingAssistantEntries.at(-1) as any;
  component.runBookingAssistantAction(prompt.actions[0]);

  expect(loadsApi.updateLoad).toHaveBeenCalledWith(
    'load-1',
    { status: 'readyToBill', statusNote: 'Delivered from Booking chat. Ready for billing review.' }
  );
  expect(component.selectedRoomDeliveredReady).toBeTrue();
});

it('keeps send-to-loads-console unavailable until delivered is green', () => {
  const component = createComponent();
  component.user = userWithRole('carrier');
  component.activeTab = 'direct';
  component.activeDirectConsoleView = 'booking';
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
  component.loads = [createLoad({ status: 'active' }) as any];

  component.sendSelectedLoadToLoadsConsole();

  expect(component.activeTab).toBe('direct');
  expect(component.loadError).toContain('Mark this booking delivered');
});
```

- [ ] **Step 2: Run the test and confirm it fails for any missing guards**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected before implementation: FAIL if delivery handoff allows the tab change too early or the messages do not mention the live load requirement.

- [ ] **Step 3: Update tracking prompt wording**

In `beginTrackingAssist()`, use this user-facing prompt when no provider is staged:

```ts
this.bookingAssistantAction = 'trackingConnect';
this.appendBookingAssistantMessage('assistant', 'Tracking is still red. Connect your ELD/API or send MacroPoint?');
return;
```

In `bookingAssistantActionsForMessage()`, keep tracking actions as:

```ts
case 'trackingConnect':
  return [
    { type: 'connectEld', label: 'Connect ELD' },
    { type: 'sendMacroPoint', label: 'Send MacroPoint' },
  ];
```

- [ ] **Step 4: Strengthen delivered guard**

In `markSelectedBookingDelivered()`, ensure the no-load path is:

```ts
if (!this.selectedRoomLoad) {
  this.loadError = '';
  this.appendBookingAssistantMessage('assistant', 'I need a live load in Booking Chat before I can mark it delivered.');
  return;
}
```

Ensure the confirmation path asks:

```ts
this.appendBookingAssistantMessage(
  'assistant',
  this.selectedRoomTrackingReady
    ? 'Do you want to mark this load delivered and move it to Ready to bill?'
    : 'Tracking is still red. If the broker waived tracking, mark delivered anyway. Otherwise enable tracking first.'
);
```

- [ ] **Step 5: Strengthen Loads Console handoff guard**

In `sendSelectedLoadToLoadsConsole()`, ensure the early return stays:

```ts
if (!this.selectedRoomCanSendToLoadsConsole || !this.selectedRoomLoad) {
  this.loadError = 'Mark this booking delivered before sending it to Loads Console.';
  return;
}
```

Ensure the success branch is:

```ts
this.loadError = '';
this.loadMessage = `${this.selectedRoomLoad.reference} is ready in Loads Console.`;
this.activeTab = 'loads';
this.loadConsoleView = 'readyToBill';
```

- [ ] **Step 6: Run the workspace spec**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```powershell
Set-Location C:\Prometheus-Clean
git add prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.html prometheus/src/app/features/workspace/workspace.component.spec.ts
git commit -m "feat: harden tracking and delivery workflow"
```

---

### Task 4: Harden Cancellation And Contact Flow

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`

- [ ] **Step 1: Add failing tests for cancellation and contact behavior**

In `prometheus/src/app/features/workspace/workspace.component.spec.ts`, add these tests near the existing contact and cancellation-related tests:

```ts
it('keeps cancel load red and asks to reject approval when no live load exists', () => {
  const component = createComponent();
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

  component.beginCancellationAssist();

  expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Reject the offer or cancel the approval');
});

it('moves a canceled load waiting on TONU to library', () => {
  const updatedLoad = createLoad({ status: 'library' });
  const loadsApi = {
    updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
  };
  const component = createComponent({ loadsApi });
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
  component.loads = [createLoad({ status: 'active' }) as any];

  component.beginCancellationAssist();
  const prompt = component.bookingAssistantEntries.at(-1) as any;
  component.runBookingAssistantAction(prompt.actions[0]);

  expect(loadsApi.updateLoad).toHaveBeenCalledWith(
    'load-1',
    { status: 'library', statusNote: 'Waiting on TONU after broker cancellation.' }
  );
});

it('removes an active load when cancel now is selected', () => {
  const loadsApi = {
    deleteLoad: jasmine.createSpy('deleteLoad').and.returnValue(of({ deleted: true, loadId: 'load-1' })),
  };
  const component = createComponent({ loadsApi });
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
  component.loads = [createLoad({ status: 'active' }) as any];

  component.beginCancellationAssist();
  const prompt = component.bookingAssistantEntries.at(-1) as any;
  component.runBookingAssistantAction(prompt.actions[1]);

  expect(loadsApi.deleteLoad).toHaveBeenCalledWith('load-1');
  expect(component.loads.length).toBe(0);
});
```

- [ ] **Step 2: Run the test and confirm it fails for wording or cancellation behavior gaps**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected before implementation: FAIL if the no-load cancellation text does not include the expected instruction or if cancellation API calls differ.

- [ ] **Step 3: Update no-load cancellation wording**

In `beginCancellationAssist()`, use this exact no-load message:

```ts
this.appendBookingAssistantMessage('assistant', 'This booking does not have a live load yet. Reject the offer or cancel the approval before it becomes a live load.');
```

- [ ] **Step 4: Keep TONU and cancel-now behavior explicit**

In `handleSelectedLoadCancellation(waitingOnTonu: boolean)`, keep TONU path:

```ts
if (waitingOnTonu) {
  this.updateLoadBoardStatus(load._id, 'library', 'Waiting on TONU after broker cancellation.');
  return;
}
```

Keep cancel-now success:

```ts
next: () => {
  this.loads = this.loads.filter((entry) => entry._id !== load._id);
  this.loadMessage = `${load.reference} was canceled and removed from Loads Console.`;
},
```

- [ ] **Step 5: Confirm Add Contact still switches to Main Chat**

Keep `saveCurrentBrokerContact()` success branch:

```ts
this.selectedBrokerContactId = nextRecord.id;
this.activeDirectConsoleView = 'main';
this.loadError = '';
this.loadMessage = `${room.contactName || room.companyName} is now saved in Direct Chat contacts.`;
this.appendBookingAssistantMessage('assistant', `${room.contactName || room.companyName} is now saved in Main chat contacts.`);
```

- [ ] **Step 6: Run the workspace spec**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
Set-Location C:\Prometheus-Clean
git add prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.spec.ts
git commit -m "feat: harden booking cancellation flow"
```

---

### Task 5: Final UI And Verification

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`
- Modify: `prometheus/src/app/features/workspace/workspace.component.scss`
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`

- [ ] **Step 1: Add final readiness test for state button labels**

In `prometheus/src/app/features/workspace/workspace.component.spec.ts`, add:

```ts
it('exposes readiness from booking workflow state for the left-side booking buttons', () => {
  const component = createComponent();
  component.user = userWithRole('carrier');
  component.selectedRoomId = 'room-1';
  component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

  expect(component.selectedRoomSetupReady).toBeFalse();
  expect(component.selectedRoomDriverReady).toBeFalse();
  expect(component.selectedRoomContactReady).toBeFalse();
  expect(component.selectedRoomTrackingReady).toBeFalse();
  expect(component.selectedRoomDeliveredReady).toBeFalse();

  component.chooseSetupProvider('highway' as any);
  component.assignDriverToSelectedRoom((component as any).driverRoster[0]);
  component.saveCurrentBrokerContact();
  component.runBookingAssistantAction({ type: 'sendMacroPoint', label: 'Send MacroPoint' } as any);
  (component as any).ensureDirectRoomWorkflow('room-1').delivered = true;

  expect(component.selectedRoomSetupReady).toBeTrue();
  expect(component.selectedRoomDriverReady).toBeTrue();
  expect(component.selectedRoomContactReady).toBeTrue();
  expect(component.selectedRoomTrackingReady).toBeTrue();
  expect(component.selectedRoomDeliveredReady).toBeTrue();
});
```

- [ ] **Step 2: Run the workspace spec and confirm it fails if readiness is not wired**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include src/app/features/workspace/workspace.component.spec.ts
```

Expected before implementation: FAIL only if a readiness getter is not wired to state.

- [ ] **Step 3: Keep state buttons visually driven by readiness**

In `prometheus/src/app/features/workspace/workspace.component.html`, ensure each button follows this pattern:

```html
<button
  class="secondary-button status-button"
  type="button"
  [class.status-button--ready]="selectedRoomSetupReady"
  [class.status-button--pending]="!selectedRoomSetupReady"
  [disabled]="!selectedRoom"
  (click)="beginSetupAssist()"
>
  Get setup
</button>
```

Apply the same ready/pending class pattern for `Assign driver`, `Add contact`, `Track`, and `Delivered`. Keep cancel as:

```html
<button class="ghost-button status-button status-button--danger" type="button" [disabled]="!selectedRoom" (click)="beginCancellationAssist()">
  Cancel load
</button>
```

Keep Send to Loads Console as:

```html
<button
  *ngIf="selectedRoomCanSendToLoadsConsole"
  class="primary-button status-button status-button--ready status-button--wide"
  type="button"
  (click)="sendSelectedLoadToLoadsConsole()"
>
  Send to Loads Console
</button>
```

- [ ] **Step 4: Keep button layout stable**

In `prometheus/src/app/features/workspace/workspace.component.scss`, keep the booking grid stable:

```scss
.quick-actions--booking-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;

  .status-button {
    width: 100%;
  }
}
```

- [ ] **Step 5: Run frontend tests**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: `TOTAL: 30 SUCCESS` or higher, depending on the new tests added.

- [ ] **Step 6: Run frontend build**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm run build
```

Expected: Build succeeds. Existing size budget warnings may remain.

- [ ] **Step 7: Commit Task 5**

Run:

```powershell
Set-Location C:\Prometheus-Clean
git add prometheus/src/app/features/workspace/workspace.component.html prometheus/src/app/features/workspace/workspace.component.scss prometheus/src/app/features/workspace/workspace.component.spec.ts
git commit -m "test: cover booking state controls"
```

---

## Final Verification

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless
npm run build

Set-Location C:\Prometheus-Clean
git status --short
```

Expected:

- All Angular tests pass.
- Angular build passes with only existing budget warnings.
- Git status is clean after commits.

## Manual Smoke

After servers are running:

1. Open `http://localhost:4300/sign-in`.
2. Sign in as broker or carrier demo user.
3. Open Booking Chat.
4. Confirm approval appears as an AI chat prompt with `Approve booking` and `Reject offer`.
5. Approve from one side and confirm Prometheus waits on the other side.
6. Approve from the other side and confirm the live load appears in Booking Chat.
7. Click `Get setup`, choose a provider, and confirm the button turns green.
8. Click `Assign driver`, choose a driver/truck, and confirm the button turns green.
9. Click `Add contact` and confirm Main Chat opens with the contact.
10. Return to Booking Chat, click `Track`, choose MacroPoint, and confirm tracking turns green.
11. Click `Delivered`, confirm delivery, and confirm `Send to Loads Console` appears.
12. Click `Send to Loads Console` and confirm Ready to Bill view opens.
13. Test `Cancel load` on another active booking and confirm TONU moves to Library while cancel-now removes the active load.

## Completion Criteria

- Booking approval decision lives in AI chat, not as confusing sidebar negotiation controls.
- Setup, driver, contact, tracking, delivery, cancellation, and Loads Console handoff match the approved spec.
- Red/green button states reflect real current readiness.
- Live load creation still requires backend `bookingStatus: "booked"`.
- New and existing frontend tests pass.
- Frontend build passes.
