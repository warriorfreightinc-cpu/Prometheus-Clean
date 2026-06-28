# Sandbox Provider Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable local sandbox provider previews for setup, tracking, ELD, and provider catalog workflows without real vendor API keys.

**Architecture:** Add sandbox behavior inside `CompanyIntegrationsService` behind `PROMETHEUS_SANDBOX_PROVIDERS`. Keep frontend API contracts unchanged so existing Company Setup and Booking Chat UI consume sandbox providers the same way they consume real integrations.

**Tech Stack:** NestJS, TypeScript, Jest, Angular existing provider catalog/booking room UI.

---

### Task 1: Backend Sandbox Catalog And Room Choices

**Files:**
- Modify: `C:\Prometheus-Clean\prometheus-backend\src\company\integrations\company-integrations.service.spec.ts`
- Modify: `C:\Prometheus-Clean\prometheus-backend\src\company\integrations\company-integrations.service.ts`

- [ ] Write failing Jest tests for sandbox catalog readiness, room choices, and execution messages.
- [ ] Run `npm test -- company-integrations.service.spec.ts --runInBand` and confirm the new tests fail because sandbox mode is missing.
- [ ] Add sandbox provider helpers to `CompanyIntegrationsService`.
- [ ] Run the focused Jest suite and confirm it passes.

### Task 2: Local Environment Slots

**Files:**
- Modify: `C:\Prometheus-Clean\prometheus-backend\.env`
- Modify: `C:\Prometheus-Clean\prometheus-backend\.env.example`

- [ ] Add `PROMETHEUS_SANDBOX_PROVIDERS=1` to local env.
- [ ] Keep existing real provider API key slots empty.
- [ ] Ensure `.env.example` documents sandbox mode and provider key slots.

### Task 3: Verification

**Commands:**
- `cd C:\Prometheus-Clean\prometheus-backend; npm test -- company-integrations.service.spec.ts --runInBand`
- `cd C:\Prometheus-Clean\prometheus-backend; npm run build`

- [ ] Confirm backend tests pass.
- [ ] Confirm backend build passes.
