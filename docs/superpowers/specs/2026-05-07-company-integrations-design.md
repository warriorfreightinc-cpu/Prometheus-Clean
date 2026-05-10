# Company Integrations Design

## Status

Approved by David on 2026-05-07.

This spec defines the connection layer for external setup and tracking tools in Prometheus. It does not redesign Booking Chat. The existing Booking Chat buttons stay in place and keep their current labels and layout.

## Core Rule

Do not move, rename, restyle, or rebuild the Booking Chat buttons:

- Get setup
- Assign driver
- Add contact
- Track
- Delivered
- Cancel load
- Send to Loads Console

Those buttons are already the workflow surface. This slice makes them smarter by connecting them to company-level provider settings.

## Goal

After company approval and payment, the main company account should be able to connect the tools that company uses. Booking Chat then reads those connections when a dispatcher clicks the existing workflow buttons.

The first production goal is to support two provider groups:

1. Setup providers for carrier/broker packets.
2. Tracking providers for broker tracking, carrier ELD, and custom APIs.

Prometheus should not force every company into one provider. Different companies may use different tools.

## Company Admin Experience

Add a Company Integrations area for the main company account. This can live inside Company Setup or the company admin area after activation.

The company admin can configure:

- Setup providers:
  - Highway
  - MyCarrierPacket
  - Truckstop
  - Manual packet / custom setup link
  - Custom API placeholder

- Broker tracking providers:
  - MacroPoint
  - FourKites
  - TQL tracking
  - Custom tracking API

- Carrier tracking providers:
  - ELD provider name
  - ELD API token/key
  - ELD callback or endpoint if needed later

Each integration should have:

- Provider type.
- Provider name.
- Enabled / disabled status.
- Display label shown in Booking Chat.
- Credential status: not connected, connected, needs attention.
- Optional notes or setup URL.
- Created/updated audit fields.

Credentials should not be exposed back to the frontend after saving. The UI can show connection status and provider label only.

## Booking Chat Behavior

Booking Chat keeps the existing buttons. The behavior changes only in the options Prometheus offers inside the chat.

### Get Setup

When the dispatcher clicks `Get setup`, Prometheus checks the company integrations:

- If the company has setup providers connected, Prometheus offers those providers.
- If the counterparty has a preferred setup method, Prometheus can show that first.
- If nothing is connected, Prometheus offers manual setup packet guidance and tells the company admin to connect providers in Company Integrations.

Example:

> Which setup method should I use for this broker?
> Highway, MyCarrierPacket, Truckstop, or Manual packet.

### Track

When the dispatcher clicks `Track`, Prometheus checks both sides of the booking:

- Broker-side tracking providers, such as MacroPoint, FourKites, TQL tracking, or custom API.
- Carrier-side ELD provider/API.

Prometheus asks which source to use:

> Tracking can be started through broker tracking or carrier ELD. Which one should I use?

Options should be generated from the connected providers:

- Broker MacroPoint
- Broker FourKites
- Broker TQL tracking
- Carrier ELD
- Manual tracking update

If one side has no connected provider, Prometheus only shows the available choices and explains what is missing.

### Delivered, Cancel, Driver, Contact

This integration slice should not change those button flows. They continue to work as they do now.

## Backend Design

Add a company integration model. Recommended shape:

```ts
type CompanyIntegrationCategory = "setup" | "tracking" | "eld";
type CompanyIntegrationStatus = "not_connected" | "connected" | "needs_attention" | "disabled";

interface CompanyIntegration {
  companyId: string;
  category: CompanyIntegrationCategory;
  provider: string;
  label: string;
  status: CompanyIntegrationStatus;
  enabled: boolean;
  setupUrl?: string;
  credentialRef?: string;
  notes?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Credentials should be stored separately or encrypted before storage. The first implementation can store placeholder metadata while leaving real secret storage behind a service boundary.

Add endpoints:

- `GET /company/integrations`
  - Returns integrations for the current user's company.

- `POST /company/integrations`
  - Creates or updates one provider connection.

- `PATCH /company/integrations/:id`
  - Enables/disables or updates display metadata.

- `DELETE /company/integrations/:id`
  - Soft disables an integration, not hard delete.

- `GET /messages/room/integrations`
  - Given brokerPostId and carrierPostId, returns available setup/tracking choices for that booking room.

The room integrations endpoint lets Booking Chat ask one question without knowing all company setup details.

## Frontend Design

Add a Company Integrations panel for admin/main company users.

The panel should show:

- Setup providers list.
- Tracking providers list.
- Carrier ELD/API list.
- Connection status chips.
- Add/edit provider action.

Booking Chat should consume integration choices through `MessagesApiService` or a small `CompanyIntegrationsApiService`.

Existing Booking Chat button handlers should stay in place:

- `beginSetupAssist()` should load setup choices and display them in chat.
- `beginTrackingAssist()` should load tracking choices and display them in chat.

If the endpoint fails, the current local/manual choices should remain available so dispatchers are not blocked.

## Data Flow

1. Master approves company.
2. Company admin completes payment and user setup.
3. Company admin opens Company Integrations.
4. Company admin connects setup/tracking/ELD providers.
5. Broker/carrier posts load or truck.
6. Match becomes booking.
7. Dispatcher clicks existing Booking Chat button.
8. Prometheus reads connected providers for that booking.
9. Prometheus asks the dispatcher which provider to use.
10. Later production slices call the real provider API.

## Error Handling

- Missing credentials: show provider as needs attention.
- Disabled provider: do not show it in Booking Chat options.
- API failure: show manual fallback and log the error.
- Unsupported provider: save as custom/manual provider.
- No connected tracking: Prometheus says no connected tracking provider is active and offers manual tracking.

## Testing

Backend tests:

- Admin can create setup/tracking/ELD integrations for their company.
- Non-admin operational users cannot create company integrations.
- Disabled integrations are not returned as Booking Chat choices.
- Room integration choices include broker tracking and carrier ELD when both sides have providers.
- Credential fields are not returned to the frontend.

Frontend tests:

- Company Integrations panel lists provider groups and status.
- `Get setup` uses connected setup providers when available.
- `Track` asks broker tracking versus carrier ELD when both exist.
- `Track` falls back to manual guidance when no providers exist.
- Existing Booking Chat button labels and placement do not change.

Verification commands:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
npm test -- --runInBand

Set-Location C:\Prometheus-Clean\prometheus
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```

## Out Of Scope

This slice does not implement live API calls to Highway, MyCarrierPacket, Truckstop, MacroPoint, FourKites, TQL, or ELD providers.

This slice creates the connection point and provider selection workflow. Real provider calls can plug into the stored integration records later.

## Acceptance Criteria

- Existing Booking Chat buttons are unchanged visually.
- Company admins can define setup/tracking/ELD providers.
- Booking Chat can ask which connected setup or tracking provider to use.
- Broker tracking and carrier ELD can both appear as choices when both are configured.
- Manual fallback remains available.
- Credentials are not leaked to the frontend.
- Tests protect the no-button-change rule and provider-choice behavior.

## Spec Self-Review

- No placeholder requirements remain.
- The scope is limited to company integration connection points and Booking Chat provider choice.
- Existing button behavior is protected explicitly.
- Real external API execution is deferred to later provider-specific slices.
