# DigitalOcean Staging Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Prometheus configurable for a private DigitalOcean App Platform staging deployment.

**Architecture:** Use a same-origin `/api` ingress route for backend calls, with Angular served as a static site at `/`. Keep local development on `localhost:3100` and make the backend prefer DigitalOcean's `PORT` at runtime.

**Tech Stack:** Angular 16, NestJS 10, Socket.IO, DigitalOcean App Platform, DigitalOcean Managed MongoDB.

---

### Task 1: Backend Runtime Port

**Files:**
- Create: `prometheus-backend/src/config/runtime-port.ts`
- Create: `prometheus-backend/src/config/runtime-port.spec.ts`
- Modify: `prometheus-backend/src/main.ts`

- [x] Write tests for `PORT`, `API_PORT`, and default `3100`.
- [x] Implement `resolveRuntimePort`.
- [x] Use it in `main.ts`.
- [x] Run `npm test -- config/runtime-port.spec.ts --runInBand`.

### Task 2: Frontend Production API And Realtime Path

**Files:**
- Create: `prometheus/src/environments/environment.prod.ts`
- Create: `prometheus/src/app/core/realtime/socket-endpoint.ts`
- Create: `prometheus/src/app/core/realtime/socket-endpoint.spec.ts`
- Modify: `prometheus/angular.json`
- Modify: `prometheus/src/app/core/realtime/prometheus-socket.service.ts`

- [x] Add production file replacement to use `apiBaseUrl: "/api/"`.
- [x] Add Socket.IO endpoint resolver for local and `/api` routing.
- [x] Update the realtime service to pass `path` to `io`.
- [x] Run `npx ng test --include src/app/core/realtime/socket-endpoint.spec.ts --watch=false --browsers=ChromeHeadless`.

### Task 3: DigitalOcean Template And Docs

**Files:**
- Create: `.do/app-staging.template.yaml`
- Create: `docs/DIGITALOCEAN-STAGING-PREP.md`
- Modify: `prometheus-backend/.env.example`
- Modify: `prometheus/package.json`
- Modify: `prometheus-backend/package.json`

- [x] Add Node 18 and npm 9 engine pins.
- [x] Document `PORT` in backend `.env.example`.
- [x] Add App Platform staging template with `/api` ingress.
- [x] Add staging checklist and required secrets.

### Task 4: Verification

**Files:**
- Modify as needed only if tests reveal a defect.

- [x] Run backend focused tests.
- [x] Run frontend Socket.IO endpoint test.
- [x] Run backend build.
- [x] Run frontend production build.
- [x] Commit the deployment-prep slice.
