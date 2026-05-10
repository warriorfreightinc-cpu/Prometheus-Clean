# Route Intelligence Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Phase 1 Route Intelligence Panel so Prometheus can answer route/map/tracking questions from the AI Matching Console and Booking Chat using the data already inside the workspace.
**Architecture:** Keep this frontend-only for Phase 1. `WorkspaceComponent` owns a route panel state object, command handlers populate it from selected postings, match candidates, booking rooms, loads, and tracking workflow state, and the template renders a reusable panel without changing existing booking action buttons.
**Tech Stack:** Angular, TypeScript, Jasmine/Karma, existing workspace models and frontend service stubs.

---

## File Structure

- `prometheus/src/app/features/workspace/workspace.component.ts`
  Add route panel state, command routing, data builders, and format helpers.
- `prometheus/src/app/features/workspace/workspace.component.html`
  Add a reusable route intelligence panel in the workspace view.
- `prometheus/src/app/features/workspace/workspace.component.scss`
  Style the route panel to match the current dark operations UI.
- `prometheus/src/app/features/workspace/workspace.component.spec.ts`
  Add regression tests for matching commands, booking commands, and unchanged booking button labels.

No backend endpoint is needed in this phase. Google Routes, live MacroPoint/FourKites/TQL/ELD polling, toll APIs, and fuel-market APIs remain provider integrations after this panel is wired.

## Task 1: Add Failing Route Intelligence Tests

- [ ] Open `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.spec.ts`.

- [ ] Add tests near the matching console tests that prove route/map commands are handled locally and do not call ChatBB:

```ts
it('opens route intelligence from matching console map commands without using ChatBB', () => {
  const { component, chatbbApi } = createComponent();
  spyOn(chatbbApi, 'createMessage').and.callThrough();
  component.user = {
    id: 'broker-user',
    name: 'Brooke Broker',
    role: 'broker',
    companyName: 'Coyote Logistics',
    companyRole: 'admin'
  };
  component.posts = [
    {
      id: 'load-1',
      kind: 'load',
      origin: 'Chicago, IL',
      destination: 'Memphis, TN',
      equipment: 'V 53',
      weight: 42000,
      commodity: 'Hazmat chemicals',
      rate: 2500,
      availability: 'Today 3 PM',
      createdAt: new Date('2026-05-10T14:00:00Z').toISOString(),
      sourceCompany: 'Coyote Logistics',
      status: 'posted'
    } as WorkspacePost
  ];
  component.selectedPostId = 'load-1';
  component.matchCandidates = [
    {
      id: 'candidate-1',
      post: {
        id: 'truck-1',
        kind: 'truck',
        origin: 'Chicago, IL',
        destination: 'Memphis, TN',
        equipment: 'V 53',
        weight: 43000,
        commodity: 'Hazmat',
        availability: 'Ready now',
        createdAt: new Date('2026-05-10T14:05:00Z').toISOString(),
        sourceCompany: 'Warrior Freight Systems',
        status: 'posted'
      } as WorkspacePost,
      score: 93,
      laneLabel: 'Chicago, IL -> Memphis, TN',
      reasons: [],
      actions: [],
      routeMetrics: {
        originDeadheadMiles: 12,
        destinationDeadheadMiles: null,
        tripMiles: 532,
        totalPracticalMiles: 544,
        estimatedDriveMinutes: 510,
        provider: 'fallback'
      },
      routeSummary: null
    }
  ];

  component.chatbbPrompt = 'show load map';
  component.submitMatchingConsole();

  expect(chatbbApi.createMessage).not.toHaveBeenCalled();
  expect(component.routeIntelligencePanel.open).toBeTrue();
  expect(component.routeIntelligencePanel.source).toBe('matching');
  expect(component.routeIntelligencePanel.deadheadMiles).toBe(12);
  expect(component.routeIntelligencePanel.loadedMiles).toBe(532);
  expect(component.routeIntelligencePanel.totalMiles).toBe(544);
});
```

- [ ] Add a second matching test that chooses a specific match:

```ts
it('uses requested match route metrics in the route intelligence panel', () => {
  const { component } = createComponent();
  component.user = { id: 'carrier-user', name: 'Casey Carrier', role: 'carrier', companyName: 'Warrior Freight', companyRole: 'admin' };
  component.posts = [
    {
      id: 'truck-1',
      kind: 'truck',
      origin: 'Chicago, IL',
      destination: 'Memphis, TN',
      equipment: 'V 53',
      weight: 42000,
      commodity: 'Hazmat',
      availability: 'Ready now',
      createdAt: new Date('2026-05-10T14:00:00Z').toISOString(),
      sourceCompany: 'Warrior Freight',
      status: 'posted'
    } as WorkspacePost
  ];
  component.selectedPostId = 'truck-1';
  component.matchCandidates = [
    {
      id: 'match-1',
      post: { id: 'load-1', kind: 'load', origin: 'Gary, IN', destination: 'Nashville, TN', equipment: 'V 53', weight: 41000, commodity: 'Hazmat', rate: 2100, availability: 'Today', createdAt: new Date().toISOString(), sourceCompany: 'Alpha Broker', status: 'posted' } as WorkspacePost,
      score: 82,
      laneLabel: 'Gary, IN -> Nashville, TN',
      reasons: [],
      actions: [],
      routeMetrics: { originDeadheadMiles: 33, destinationDeadheadMiles: null, tripMiles: 470, totalPracticalMiles: 503, estimatedDriveMinutes: 440, provider: 'fallback' },
      routeSummary: null
    },
    {
      id: 'match-2',
      post: { id: 'load-2', kind: 'load', origin: 'Chicago, IL', destination: 'Memphis, TN', equipment: 'RZ 53', weight: 39000, commodity: 'Hazmat reefer', rate: 3000, availability: 'Today', createdAt: new Date().toISOString(), sourceCompany: 'Bravo Broker', status: 'posted' } as WorkspacePost,
      score: 91,
      laneLabel: 'Chicago, IL -> Memphis, TN',
      reasons: [],
      actions: [],
      routeMetrics: { originDeadheadMiles: 8, destinationDeadheadMiles: null, tripMiles: 532, totalPracticalMiles: 540, estimatedDriveMinutes: 510, provider: 'fallback' },
      routeSummary: null
    }
  ];

  component.chatbbPrompt = 'show route for match 2';
  component.submitMatchingConsole();

  expect(component.routeIntelligencePanel.open).toBeTrue();
  expect(component.routeIntelligencePanel.laneLabel).toContain('Chicago, IL');
  expect(component.routeIntelligencePanel.loadedMiles).toBe(532);
  expect(component.routeIntelligencePanel.suggestedRate).toBe(3000);
});
```

- [ ] Add a booking chat test near the booking workflow tests:

```ts
it('opens route intelligence from booking chat tracking commands', () => {
  const { component } = createComponent();
  component.activeTab = 'direct';
  component.activeDirectConsoleView = 'booking';
  const room = createRoom({ id: 'booking-1', loadId: 'LD-4721', trackingStatus: 'active' });
  component.directRooms = [room];
  component.selectedDirectRoomId = room.id;
  component.directWorkflows = {
    [room.id]: {
      setupComplete: true,
      driverAssigned: true,
      contactAdded: true,
      trackingShared: true,
      delivered: false,
      sentToLoadsConsole: false,
      cancelled: false,
      trackingProvider: 'MacroPoint'
    }
  };
  component.loads = [
    {
      id: 'LD-4721',
      origin: 'Chicago, IL',
      destination: 'Memphis, TN',
      equipment: 'V 53',
      weight: 42000,
      rate: 2500,
      status: 'active',
      brokerName: 'Brooke Broker',
      carrierName: 'Warrior Freight',
      driverName: 'Bob Carter',
      pickupDate: new Date('2026-05-10T20:00:00Z').toISOString(),
      deliveryDate: new Date('2026-05-11T08:00:00Z').toISOString()
    } as PrometheusLoad
  ];

  component.chatbbPrompt = 'show tracking map';
  component.sendChatbbMessage();

  expect(component.routeIntelligencePanel.open).toBeTrue();
  expect(component.routeIntelligencePanel.source).toBe('booking');
  expect(component.routeIntelligencePanel.trackingProvider).toBe('MacroPoint');
  expect(component.routeIntelligencePanel.trackingStatus).toBe('live');
});
```

- [ ] Run the focused frontend spec:

```powershell
cd C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts
```

Expected result before implementation: the new tests fail because `routeIntelligencePanel` and the command handlers do not exist yet.

## Task 2: Add Route Panel State And Builders

- [ ] Open `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.ts`.

- [ ] Add this type near the other local type aliases:

```ts
type RouteIntelligencePanelState = {
  open: boolean;
  source: 'matching' | 'booking';
  laneLabel: string;
  originLabel: string;
  destinationLabel: string;
  stops: string[];
  truckLocationLabel: string;
  deadheadMiles: number | null;
  loadedMiles: number | null;
  totalMiles: number | null;
  postedRate: number | null;
  suggestedRate: number | null;
  fuelEstimate: number | null;
  tollEstimate: number | null;
  routeProvider: string;
  trackingProvider: string | null;
  trackingStatus: 'notConnected' | 'connected' | 'live';
  hazmatNotes: string[];
};
```

- [ ] Add the component property beside other workspace state fields:

```ts
routeIntelligencePanel: RouteIntelligencePanelState = this.emptyRouteIntelligencePanel();
```

- [ ] Add these state and command helpers inside the component class:

```ts
private emptyRouteIntelligencePanel(): RouteIntelligencePanelState {
  return {
    open: false,
    source: 'matching',
    laneLabel: '',
    originLabel: '',
    destinationLabel: '',
    stops: [],
    truckLocationLabel: 'Not connected',
    deadheadMiles: null,
    loadedMiles: null,
    totalMiles: null,
    postedRate: null,
    suggestedRate: null,
    fuelEstimate: null,
    tollEstimate: null,
    routeProvider: 'Estimated from posted lane data',
    trackingProvider: null,
    trackingStatus: 'notConnected',
    hazmatNotes: [
      'Hazmat route review is estimated until live routing provider data is connected.',
      'Dispatcher must confirm commodity restrictions, tunnel rules, and consignee appointment windows.'
    ]
  };
}

closeRouteIntelligencePanel(): void {
  this.routeIntelligencePanel = this.emptyRouteIntelligencePanel();
}

private isRouteIntelligenceCommand(prompt: string): boolean {
  return /\b(route|map|miles|deadhead|loaded miles|tracking map|show tracking|trip)\b/i.test(prompt);
}

private parseRouteMatchIndex(prompt: string): number | null {
  const match = prompt.match(/\bmatch\s*(\d+)\b/i);
  if (!match) {
    return null;
  }
  const index = Number(match[1]);
  return Number.isFinite(index) && index > 0 ? index - 1 : null;
}
```

- [ ] Add matching panel builders:

```ts
private openRouteIntelligenceFromMatching(prompt: string): void {
  const selectedPost = this.posts.find((post) => post.id === this.selectedPostId) ?? this.posts[0] ?? null;
  const requestedIndex = this.parseRouteMatchIndex(prompt);
  const candidate = requestedIndex !== null ? this.matchCandidates[requestedIndex] : this.matchCandidates[0];

  if (candidate || selectedPost) {
    this.routeIntelligencePanel = this.buildRoutePanelFromPost(selectedPost, candidate ?? null);
    this.appendMatchingBubble(
      'agent',
      'I opened the route intelligence panel with deadhead, loaded miles, estimated rate, and hazmat route notes for this lane.',
      'Prometheus'
    );
    return;
  }

  this.routeIntelligencePanel = {
    ...this.emptyRouteIntelligencePanel(),
    open: true,
    source: 'matching',
    laneLabel: 'No active lane selected'
  };
  this.appendMatchingBubble('agent', 'Post a hazmat load or truck first, then I can map the route intelligence for it.', 'Prometheus');
}

private buildRoutePanelFromPost(sourcePost: WorkspacePost | null, candidate: MatchCandidate | null): RouteIntelligencePanelState {
  const lanePost = candidate?.post ?? sourcePost;
  const routeMetrics = candidate?.routeMetrics ?? null;
  const originLabel = this.formatLocation(lanePost?.origin ?? sourcePost?.origin ?? 'Unknown origin');
  const destinationLabel = this.formatLocation(lanePost?.destination ?? sourcePost?.destination ?? 'Unknown destination');
  const deadheadMiles = this.routeNumber(routeMetrics?.originDeadheadMiles ?? null);
  const loadedMiles = this.routeNumber(routeMetrics?.tripMiles ?? lanePost?.distance ?? null);
  const totalMiles = this.routeNumber(routeMetrics?.totalPracticalMiles ?? ((deadheadMiles ?? 0) + (loadedMiles ?? 0)) || null);
  const postedRate = this.routeNumber((lanePost as WorkspacePost | null)?.rate ?? sourcePost?.rate ?? null);

  return {
    ...this.emptyRouteIntelligencePanel(),
    open: true,
    source: 'matching',
    laneLabel: candidate?.laneLabel ?? `${originLabel} -> ${destinationLabel}`,
    originLabel,
    destinationLabel,
    stops: this.routeStopsFromPost(lanePost),
    truckLocationLabel: sourcePost?.kind === 'truck' ? originLabel : candidate?.post.kind === 'truck' ? this.formatLocation(candidate.post.origin) : 'Not connected',
    deadheadMiles,
    loadedMiles,
    totalMiles,
    postedRate,
    suggestedRate: postedRate,
    fuelEstimate: null,
    tollEstimate: null,
    routeProvider: routeMetrics?.provider ? `Estimated by ${routeMetrics.provider}` : 'Estimated from posted lane data',
    trackingProvider: null,
    trackingStatus: 'notConnected'
  };
}
```

- [ ] Add booking panel builders:

```ts
private openRouteIntelligenceFromBooking(trigger: 'command' | 'tracking'): void {
  const room = this.selectedRoom;
  if (!room) {
    this.appendBookingAssistantMessage('agent', 'Open a booking first, then I can show route intelligence for that load.');
    return;
  }

  this.routeIntelligencePanel = this.buildRoutePanelFromBooking(room, this.selectedRoomLoad ?? null);
  const message = trigger === 'tracking'
    ? 'Tracking is connected. I opened the route intelligence panel so you can watch the route, miles, and hazmat notes.'
    : 'I opened the route intelligence panel for this booking.';
  this.appendBookingAssistantMessage('agent', message);
}

private buildRoutePanelFromBooking(room: DirectRoom, load: PrometheusLoad | null): RouteIntelligencePanelState {
  const workflow = this.directWorkflows[room.id];
  const originLabel = this.formatLocation(load?.origin ?? room.laneOrigin ?? 'Unknown origin');
  const destinationLabel = this.formatLocation(load?.destination ?? room.laneDestination ?? 'Unknown destination');
  const loadedMiles = this.routeNumber(load?.miles ?? null);
  const rate = this.routeNumber(load?.rate ?? room.rate ?? null);

  return {
    ...this.emptyRouteIntelligencePanel(),
    open: true,
    source: 'booking',
    laneLabel: `${originLabel} -> ${destinationLabel}`,
    originLabel,
    destinationLabel,
    stops: this.routeStopsFromLoad(load),
    truckLocationLabel: this.selectedRoomDriverSummary || 'Driver location pending ELD connection',
    deadheadMiles: null,
    loadedMiles,
    totalMiles: loadedMiles,
    postedRate: rate,
    suggestedRate: rate,
    fuelEstimate: null,
    tollEstimate: null,
    routeProvider: 'Estimated from booked load data',
    trackingProvider: workflow?.trackingProvider ?? null,
    trackingStatus: workflow?.trackingShared ? 'live' : 'notConnected'
  };
}
```

- [ ] Add utility helpers used by the builders and template:

```ts
private routeNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

private routeStopsFromPost(post: WorkspacePost | null | undefined): string[] {
  if (!post?.stops) {
    return [];
  }
  return post.stops.map((stop) => this.formatLocation(stop)).filter(Boolean);
}

private routeStopsFromLoad(load: PrometheusLoad | null): string[] {
  const rawStops = (load as PrometheusLoad & { stops?: string[] | string | null } | null)?.stops;
  if (Array.isArray(rawStops)) {
    return rawStops.map((stop) => this.formatLocation(stop)).filter(Boolean);
  }
  if (typeof rawStops === 'string' && rawStops.trim()) {
    return rawStops.split(/[|,]/).map((stop) => this.formatLocation(stop.trim())).filter(Boolean);
  }
  return [];
}

formatRouteMiles(value: number | null): string {
  return value === null ? 'Pending' : `${Math.round(value).toLocaleString()} mi`;
}

formatRouteMoney(value: number | null): string {
  return value === null ? 'Pending provider data' : this.formatCurrency(value);
}

formatRouteRatePerMile(rate: number | null, miles: number | null): string {
  if (rate === null || miles === null || miles <= 0) {
    return 'Pending';
  }
  return `${this.formatCurrency(rate / miles)}/mi`;
}

routeTrackingLabel(panel: RouteIntelligencePanelState): string {
  if (panel.trackingStatus === 'live') {
    return `${panel.trackingProvider ?? 'Tracking'} connected`;
  }
  return 'Tracking not connected';
}
```

## Task 3: Wire Matching And Booking Commands

- [ ] In `handleMatchingConsoleCommand(prompt: string)`, route map commands before market-question handling:

```ts
if (this.isRouteIntelligenceCommand(normalized)) {
  this.appendMatchingBubble('user', prompt, 'You');
  this.openRouteIntelligenceFromMatching(prompt);
  return true;
}
```

The route command must run before `isMarketQuestion(normalized)` because market questions also include words like `map`.

- [ ] In `handleBookingAssistantWorkflow(prompt: string)`, handle route commands before setup/tracking/delivery workflows:

```ts
if (this.isRouteIntelligenceCommand(normalized)) {
  this.openRouteIntelligenceFromBooking('command');
  this.chatbbPrompt = '';
  return true;
}
```

- [ ] In `beginTrackingAssist()`, when tracking is already shared, open the panel after the status message:

```ts
if (workflow.trackingShared) {
  this.appendBookingAssistantMessage('agent', `Tracking is already active through ${workflow.trackingProvider ?? 'the selected provider'}.`);
  this.openRouteIntelligenceFromBooking('tracking');
  return;
}
```

- [ ] In `applyTrackingExecution(result: BookingAssistantExecutionResult)`, open the panel after tracking turns green:

```ts
this.openRouteIntelligenceFromBooking('tracking');
```

- [ ] Run the focused spec again:

```powershell
cd C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts
```

Expected result after this task: route command tests pass or fail only because the template/CSS has not been added yet.

## Task 4: Render The Route Intelligence Panel

- [ ] Open `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.html`.

- [ ] Add this panel near the bottom of the workspace shell, outside the tab-specific panels so matching and booking can both use it:

```html
<section class="route-intelligence-panel" *ngIf="routeIntelligencePanel.open">
  <div class="route-intelligence-header">
    <div>
      <p class="eyebrow">Route intelligence</p>
      <h2>{{ routeIntelligencePanel.laneLabel }}</h2>
    </div>
    <button type="button" class="ghost-button" (click)="closeRouteIntelligencePanel()">Close</button>
  </div>

  <div class="route-intelligence-grid">
    <div class="route-metric">
      <span>Truck to pickup</span>
      <strong>{{ formatRouteMiles(routeIntelligencePanel.deadheadMiles) }}</strong>
    </div>
    <div class="route-metric">
      <span>Loaded miles</span>
      <strong>{{ formatRouteMiles(routeIntelligencePanel.loadedMiles) }}</strong>
    </div>
    <div class="route-metric">
      <span>Total trip</span>
      <strong>{{ formatRouteMiles(routeIntelligencePanel.totalMiles) }}</strong>
    </div>
    <div class="route-metric">
      <span>Rate per mile</span>
      <strong>{{ formatRouteRatePerMile(routeIntelligencePanel.suggestedRate, routeIntelligencePanel.loadedMiles) }}</strong>
    </div>
  </div>

  <div class="route-intelligence-columns">
    <div>
      <p class="route-label">Lane</p>
      <p>{{ routeIntelligencePanel.originLabel }} -> {{ routeIntelligencePanel.destinationLabel }}</p>
      <p *ngIf="routeIntelligencePanel.stops.length">Stops: {{ routeIntelligencePanel.stops.join(' -> ') }}</p>
      <p>Truck location: {{ routeIntelligencePanel.truckLocationLabel }}</p>
    </div>
    <div>
      <p class="route-label">Tracking</p>
      <p>{{ routeTrackingLabel(routeIntelligencePanel) }}</p>
      <p>{{ routeIntelligencePanel.routeProvider }}</p>
    </div>
    <div>
      <p class="route-label">Cost estimate</p>
      <p>Suggested rate: {{ formatRouteMoney(routeIntelligencePanel.suggestedRate) }}</p>
      <p>Fuel: {{ formatRouteMoney(routeIntelligencePanel.fuelEstimate) }}</p>
      <p>Tolls: {{ formatRouteMoney(routeIntelligencePanel.tollEstimate) }}</p>
    </div>
  </div>

  <div class="hazmat-route-notes">
    <p class="route-label">Hazmat notes</p>
    <ul>
      <li *ngFor="let note of routeIntelligencePanel.hazmatNotes">{{ note }}</li>
    </ul>
  </div>
</section>
```

- [ ] Open `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.scss`.

- [ ] Add restrained dark panel styles:

```scss
.route-intelligence-panel {
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 8px;
  background: rgba(5, 19, 33, 0.96);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.32);
  color: #eff6ff;
  margin-top: 24px;
  padding: 24px;
}

.route-intelligence-header {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;

  h2 {
    font-size: 28px;
    line-height: 1.15;
    margin: 6px 0 0;
  }
}

.route-intelligence-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 20px 0;
}

.route-metric,
.route-intelligence-columns > div,
.hazmat-route-notes {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(15, 35, 52, 0.72);
  padding: 16px;
}

.route-metric span,
.route-label {
  color: #93c5fd;
  display: block;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  margin: 0 0 8px;
  text-transform: uppercase;
}

.route-metric strong {
  display: block;
  font-size: 22px;
}

.route-intelligence-columns {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.hazmat-route-notes {
  margin-top: 12px;

  ul {
    margin: 0;
    padding-left: 20px;
  }
}

@media (max-width: 900px) {
  .route-intelligence-grid,
  .route-intelligence-columns {
    grid-template-columns: 1fr;
  }
}
```

- [ ] Confirm the direct booking quick action button labels remain unchanged:

```html
Get setup
Assign driver
Add contact
Track
Delivered
Cancel load
Send to Loads Console
```

## Task 5: Full Verification

- [ ] Run the focused workspace spec:

```powershell
cd C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts
```

Expected output includes:

```text
TOTAL: ... SUCCESS
```

- [ ] Run the frontend test suite:

```powershell
cd C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected output includes:

```text
TOTAL: ... SUCCESS
```

- [ ] Run the Angular build:

```powershell
cd C:\Prometheus-Clean\prometheus
npm run build
```

Expected output includes a successful browser application bundle. Existing size-budget warnings are acceptable only if they already existed before this route panel task.

- [ ] If a dev server is running on `http://localhost:4300`, verify manually:
  - Matching Console: type `show load map`.
  - Matching Console: type `show route for match 1`.
  - Booking Chat: type `show tracking map`.
  - Tracking action: after tracking turns green, the panel opens automatically.
  - Booking Chat quick action buttons remain in the same order with the same labels.

## Task 6: Commit

- [ ] Stage only the route intelligence files:

```powershell
cd C:\Prometheus-Clean
git add -- prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.html prometheus/src/app/features/workspace/workspace.component.scss prometheus/src/app/features/workspace/workspace.component.spec.ts
```

- [ ] Commit:

```powershell
git commit -m "feat: add route intelligence panel"
```

## Self-Review Checklist

- [ ] Route/map commands are handled before generic market questions.
- [ ] ChatBB is not called for local route intelligence commands.
- [ ] Booking Chat buttons were not moved, renamed, or restyled.
- [ ] Tracking green state can open the route panel.
- [ ] Panel makes provider limits clear: route, fuel, tolls, and live tracking use estimates until real providers are connected.
- [ ] Tests cover matching, booking, and quick-action label preservation.
