# Route Intelligence Panel Design

## Status

Approved direction by David on 2026-05-10.

This spec covers Phase 1 of the route intelligence feature. It creates the Prometheus-owned route panel and assistant trigger points without requiring Google Maps, MacroPoint, FourKites, TQL, or ELD live credentials yet.

## Goal

Prometheus should help dispatchers and brokers understand whether a hazmat load is operationally safe and profitable before and during booking. The first version should open a focused route intelligence panel from the AI Matching Console or Booking Chat and show:

- Truck location when known.
- Deadhead miles from truck to pickup.
- Loaded miles from pickup to delivery.
- Total trip miles.
- Pickup, delivery, and intermediate stop labels.
- Suggested rate and estimated rate per mile.
- Fuel and toll estimate fields that clearly say when live provider data is not connected.
- Hazmat route notes and alternative-route fields that clearly say when live provider data is not connected.
- Tracking status from the existing Booking Chat workflow.

The panel must still work without a live map provider by using the existing backend routing fallback and the route metrics already produced by matching snapshots.

## Scope

### In Scope

- Add a route intelligence panel inside the workspace UI.
- Let AI Matching Console commands like `show load map`, `show route`, `map this lane`, or `route intelligence` open the panel.
- Let Booking Chat tracking flow open the same panel after tracking is green.
- Use existing `MatchCandidate.routeMetrics`, selected posting data, selected booking room data, and selected load data.
- Show a clear fallback state when precise route data is missing.
- Keep all existing Booking Chat button labels, order, and placement unchanged.
- Add tests for assistant command routing and panel state.

### Out of Scope For Phase 1

- Real Google Maps JavaScript map rendering.
- Real Google Routes API calls.
- Live MacroPoint/FourKites/TQL/ELD polling.
- Real-time route deviation detection.
- Real fuel price or toll vendor integration.
- Automated theft/security alerts.

Those are Phase 2 and Phase 3.

## User Experience

The route panel appears as a practical operations panel, not a marketing card. It should feel like a dispatch tool.

The panel opens in two places:

1. AI Matching Console:
   - User asks: `show load map`, `show route for match 1`, `what are the miles`, or similar.
   - Prometheus opens the route panel for the selected posting and best/current match.
   - Prometheus also adds a short assistant message explaining what it found.

2. Booking Chat:
   - User clicks `Track` and chooses a provider.
   - Once tracking becomes green, Prometheus can open route intelligence for that booking.
   - If the user asks `show tracking map`, the same panel opens.

Panel sections:

- Lane summary: origin, destination, stops, equipment, weight, rate.
- Miles: deadhead, loaded miles, total miles.
- Economics: suggested rate, posted rate, estimated fuel, estimated tolls, estimated RPM.
- Tracking: provider, green/red status, and last known location status when available.
- Hazmat route guard: notes that route restrictions are estimates until a live hazmat routing provider is connected.
- Next actions: text guidance only in Phase 1, no new workflow buttons.

## Data Model

Add frontend-only panel state first:

```ts
type RouteIntelligencePanelState = {
  open: boolean;
  source: "matching" | "booking";
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
  trackingStatus: "notConnected" | "connected" | "live";
  hazmatNotes: string[];
};
```

Phase 1 can compute this from existing frontend data. If a value cannot be trusted, the field should be `null` and the UI should say `Pending provider data` rather than inventing precision.

## Backend Path

Phase 1 does not need a new backend endpoint. It can use:

- Matching snapshot route metrics for match candidates.
- Post `distance` fields when available.
- Booking/load data already loaded in workspace.
- Existing routing fallback indirectly through matching snapshots.

If implementation reveals the frontend is missing enough route data, add a small backend endpoint later:

- `POST /routing/intelligence`

That endpoint would accept origin, destination, stops, equipment, weight, and truck location, then return the panel state. It should still use the existing `RoutingService` abstraction so Google can be added behind the same interface later.

## Google Maps Phase 2

Google Maps should be added behind provider configuration, not hardwired into the UI.

Recommended provider layering:

1. Fallback routing provider: existing approximate miles, always available.
2. Google Maps display provider: map rendering and markers when key exists.
3. Google Routes provider: route alternatives, richer ETA, toll/fuel inputs when enabled.

The Google key should live in environment variables and never be committed.

The UI should show `Map provider not connected` instead of failing when the key is missing or quota is exceeded.

## Tracking Security Phase 3

After live tracking integration exists, route intelligence becomes a security monitor:

- Compare expected route to live truck position.
- Alert if the truck is stopped too long outside normal rest assumptions.
- Alert if the truck moves away from the route or pickup/delivery.
- Alert if the truck misses pickup appointment risk windows.
- Alert both broker and carrier when tracking suggests theft, route deviation, or safety risk.

Alerts should be advisory, not accusations. Use wording like:

> Tracking risk detected. Truck has been stopped away from the expected route longer than the configured threshold. Please verify driver status.

## Error Handling

- No selected posting: ask the user to select or post a load/truck first.
- No selected match: show route panel for the selected posting only and say matching route is pending.
- Missing coordinates: show city/state labels and mark miles as pending.
- Missing truck location: show route from pickup to delivery and mark deadhead as pending.
- Tracking not connected: show tracking red and explain which Booking Chat provider step is missing.
- Provider failure: keep fallback panel open and show provider status as unavailable.

## Testing

Frontend tests:

- Matching Console command `show load map` opens the route panel and does not call ChatBB.
- Matching Console command `show route for match 1` uses the selected match route metrics when available.
- Booking Chat command `show tracking map` opens the panel for the selected booking room.
- Tracking green status is reflected in the panel.
- Existing Booking Chat button labels remain unchanged.

Backend tests are not required for Phase 1 unless a new `/routing/intelligence` endpoint is added.

## Acceptance Criteria

- User can ask Prometheus to show a route/map from the Matching Console.
- User can ask Prometheus to show tracking/route map from Booking Chat.
- Panel shows deadhead, loaded miles, total miles, rate, tracking status, and hazmat notes with honest fallback labels.
- No existing Booking Chat buttons are moved, renamed, or restyled.
- Frontend tests and build pass.
