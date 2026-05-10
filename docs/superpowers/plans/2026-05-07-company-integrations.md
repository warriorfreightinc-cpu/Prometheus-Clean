# Company Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add company-level setup/tracking/ELD connection points that the existing Booking Chat buttons can consume without changing those buttons.

**Architecture:** Backend stores company integrations and exposes sanitized provider choices. The company admin UI manages those providers. Booking Chat keeps its current buttons and asks provider-choice questions based on the saved company integrations, falling back to current manual/local options when none exist.

**Tech Stack:** NestJS, Mongoose, Angular 16, RxJS, Jasmine/Karma, Jest.

---

## Hard Rule

Do not move, rename, restyle, or rebuild the existing Booking Chat buttons. The allowed Booking Chat changes are only inside existing handlers such as `beginSetupAssist()` and `beginTrackingAssist()`, where provider choices are loaded before Prometheus posts a chat prompt.

## File Ownership

### Backend Helper

Owns:

- Create `prometheus-backend/src/company/integrations/dto/company-integration.dto.ts`
- Create `prometheus-backend/src/company/integrations/company-integrations.service.ts`
- Create `prometheus-backend/src/company/integrations/company-integrations.controller.ts`
- Create `prometheus-backend/src/company/integrations/company-integrations.service.spec.ts`
- Modify `prometheus-backend/src/company/schema/company.schema.ts`
- Modify `prometheus-backend/src/company/interface/company.interface.ts`
- Modify `prometheus-backend/src/company/company.module.ts`

Backend helper must not edit frontend files.

### Company UI Helper

Owns:

- Modify `prometheus/src/app/core/api/company-api.service.ts`
- Modify `prometheus/src/app/shared/types/models.ts`
- Modify `prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.ts`
- Modify `prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.html`
- Modify `prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.scss`
- Add/update focused component tests if practical.

Company UI helper must not edit `workspace.component.*`.

### Booking Chat Helper

Owns:

- Modify `prometheus/src/app/core/api/messages-api.service.ts`
- Modify `prometheus/src/app/shared/types/models.ts` only if the Company UI helper has not already added the shared types.
- Modify `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify `prometheus/src/app/features/workspace/workspace.component.spec.ts`

Booking Chat helper must not edit `workspace.component.html` except to add tests proving existing button labels are unchanged if absolutely necessary. No visual layout changes.

### Controller / Integrator

Owns:

- Resolve any shared type conflicts.
- Add missing tests around frontend/backend integration.
- Run verification.
- Commit final integrated work.

## Task 1: Backend Company Integration Store

**Files:**

- Create: `prometheus-backend/src/company/integrations/dto/company-integration.dto.ts`
- Create: `prometheus-backend/src/company/integrations/company-integrations.service.ts`
- Create: `prometheus-backend/src/company/integrations/company-integrations.controller.ts`
- Create: `prometheus-backend/src/company/integrations/company-integrations.service.spec.ts`
- Modify: `prometheus-backend/src/company/schema/company.schema.ts`
- Modify: `prometheus-backend/src/company/interface/company.interface.ts`
- Modify: `prometheus-backend/src/company/company.module.ts`

- [ ] **Step 1: Write backend tests first**

Add tests proving:

- Admin can upsert a connected setup provider for their company.
- Non-admin roles cannot upsert integrations.
- Credential metadata is sanitized from service responses.
- Disabled integrations are not returned in room choices.
- Room choices can include broker tracking and carrier ELD providers.

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
npm test -- --runInBand company/integrations/company-integrations.service.spec.ts
```

Expected before implementation: FAIL because the service does not exist.

- [ ] **Step 2: Add company integration DTO/types**

Use categories:

```ts
export type CompanyIntegrationCategory = "setup" | "tracking" | "eld";
export type CompanyIntegrationStatus = "not_connected" | "connected" | "needs_attention" | "disabled";
```

The create/update body should support:

```ts
{
  category: "setup" | "tracking" | "eld";
  provider: string;
  label: string;
  enabled?: boolean;
  status?: "not_connected" | "connected" | "needs_attention" | "disabled";
  setupUrl?: string;
  credentialRef?: string;
  notes?: string;
}
```

- [ ] **Step 3: Store integrations on company documents**

Add an `integrations` array to the Company schema and interface. Store `credentialRef`, but never include raw secrets. If a future credential value is present, the service should convert it to a non-secret `credentialRef` or ignore it.

- [ ] **Step 4: Implement service/controller**

Endpoints:

- `GET /company/integrations`
- `POST /company/integrations`
- `PATCH /company/integrations/:id`
- `DELETE /company/integrations/:id`
- Service method for booking-room provider choices.

Controller roles:

- Company admins can manage integrations.
- Broker/carrier/manager users can read provider choices for rooms, but cannot create company integrations.

- [ ] **Step 5: Verify backend**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
npm test -- --runInBand company/integrations/company-integrations.service.spec.ts
```

Expected: PASS.

## Task 2: Company Admin Integrations Panel

**Files:**

- Modify: `prometheus/src/app/core/api/company-api.service.ts`
- Modify: `prometheus/src/app/shared/types/models.ts`
- Modify: `prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.ts`
- Modify: `prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.html`
- Modify: `prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.scss`

- [ ] **Step 1: Write failing frontend tests or compile-time API expectations**

Add tests where practical that prove the Company Setup Console can render provider groups and call the create/update integration API.

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/company-setup-console/company-setup-console.component.spec.ts
```

Expected before implementation: FAIL if the spec exists, or document if the existing project lacks a component spec harness.

- [ ] **Step 2: Add frontend types**

Add:

```ts
export type CompanyIntegrationCategory = 'setup' | 'tracking' | 'eld';
export type CompanyIntegrationStatus = 'not_connected' | 'connected' | 'needs_attention' | 'disabled';
export interface CompanyIntegrationRecord { ... }
export interface UpsertCompanyIntegrationPayload { ... }
```

- [ ] **Step 3: Add CompanyApiService methods**

Add:

- `getCompanyIntegrations()`
- `upsertCompanyIntegration(payload)`
- `updateCompanyIntegration(id, payload)`
- `disableCompanyIntegration(id)`

- [ ] **Step 4: Add panel to existing Company Setup Console**

Do not create a marketing page. Add a compact operational panel with:

- Setup providers.
- Tracking providers.
- ELD providers.
- Provider status.
- A simple add/edit form.

- [ ] **Step 5: Verify frontend**

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm run build
```

Expected: PASS.

## Task 3: Booking Chat Provider Choice Lookup

**Files:**

- Modify: `prometheus/src/app/core/api/messages-api.service.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`
- Avoid modifying `prometheus/src/app/features/workspace/workspace.component.html` unless adding a no-label-change test requires reading labels.

- [ ] **Step 1: Write failing workspace tests first**

Add tests proving:

- Existing Booking Chat button labels still include `Get setup`, `Assign driver`, `Add contact`, `Track`, `Delivered`, `Cancel load`.
- `beginSetupAssist()` uses connected setup providers when the API returns them.
- `beginTrackingAssist()` asks broker tracking versus carrier ELD when both exist.
- `beginTrackingAssist()` falls back to current MacroPoint/ELD guidance when the provider lookup fails.

Run:

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts
```

Expected before implementation: FAIL on provider-choice behavior.

- [ ] **Step 2: Add API method**

Add a `getRoomIntegrationChoices({ brokerPostId, carrierPostId })` method to `MessagesApiService` or `CompanyApiService`, depending on backend route.

- [ ] **Step 3: Update existing handlers only**

Change only the internal behavior of:

- `beginSetupAssist()`
- `beginTrackingAssist()`

Do not move UI elements. Do not change button text.

- [ ] **Step 4: Preserve manual fallback**

If the API returns no providers or errors, keep current choices:

- Setup: Highway, MyCarrierPacket, Truckstop.
- Tracking: Connect ELD, Send MacroPoint.

- [ ] **Step 5: Verify workspace tests**

Run the focused workspace spec and confirm all tests pass.

## Task 4: Integration Verification

**Files:**

- Modify only files needed to resolve conflicts or missing shared types.

- [ ] **Step 1: Run backend focused tests**

```powershell
Set-Location C:\Prometheus-Clean\prometheus-backend
npm test -- --runInBand company/integrations/company-integrations.service.spec.ts messages/messages.service.spec.ts
```

- [ ] **Step 2: Run frontend focused tests**

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts
```

- [ ] **Step 3: Run build**

```powershell
Set-Location C:\Prometheus-Clean\prometheus
npm run build
```

- [ ] **Step 4: Commit**

```powershell
Set-Location C:\Prometheus-Clean
git add prometheus-backend prometheus docs/superpowers/plans/2026-05-07-company-integrations.md
git commit -m "feat: add company integration connection points"
```

## Acceptance Checklist

- [ ] Existing Booking Chat buttons are visually unchanged.
- [ ] Company admin can define setup, tracking, and ELD providers.
- [ ] Booking Chat can use connected setup providers.
- [ ] Booking Chat can offer broker tracking or carrier ELD.
- [ ] Manual fallback remains available.
- [ ] Credentials are not returned to the frontend.
- [ ] Tests pass.
