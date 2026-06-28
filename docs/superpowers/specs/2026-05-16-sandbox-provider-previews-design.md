# Sandbox Provider Previews Design

## Status

Approved by David on 2026-05-16.

## Goal

Prometheus should let broker and carrier test accounts exercise setup, tracking, ELD, and future loadboard provider logic without real vendor contracts or API keys.

## Approach

Add a local-only sandbox provider mode controlled by `PROMETHEUS_SANDBOX_PROVIDERS`. When enabled, the backend catalog marks supported trucking providers as local sandbox previews, room provider choices include demo setup/tracking/ELD choices even when a company has no real integration records, and executing those choices returns staged demo references.

The sandbox mode must be clearly labeled. It must never pretend to call Highway, MyCarrierPackets, Truckstop, MacroPoint, FourKites, TQL, Samsara, Motive, Geotab, DAT, or CH Robinson. It only proves Prometheus workflow logic and UI behavior.

## Sandbox Providers

- Setup: Highway, MyCarrierPackets, Truckstop setup.
- Tracking: MacroPoint, FourKites, TQL tracking.
- ELD: Samsara, Motive, Geotab.
- Loadboard/TMS catalog preview: DAT, Truckstop load board, CH Robinson/Navisphere.

## Behavior

- Provider catalog shows sandbox-capable company providers as `ready` and `local` when sandbox mode is enabled.
- Provider notes include `Sandbox preview`.
- Booking room setup choices include broker setup demo providers when no real setup integration is connected.
- Booking room tracking choices include broker tracking demos, carrier ELD demos, and manual tracking.
- Executing a sandbox provider returns `status: staged`, `mode: placeholder`, a deterministic label, and a message with a demo reference such as `DEMO-MACROPOINT-BROKER`.
- Real connected company integrations continue to take priority over sandbox defaults.
- Sandbox choices disappear when `PROMETHEUS_SANDBOX_PROVIDERS` is off.

## Testing

Backend unit tests cover:

- Catalog provider statuses in sandbox mode.
- Room provider choices in sandbox mode with empty company integrations.
- Sandbox execution messages and demo references.
- Existing real integration behavior remains unchanged.

Frontend does not need new API shapes for the first pass because it already renders provider catalog items, room choices, and execution messages.
