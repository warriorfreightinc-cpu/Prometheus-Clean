# DigitalOcean Staging Prep Design

## Goal

Prepare Prometheus for a private DigitalOcean App Platform staging deployment without changing local development behavior.

## Architecture

The staging app uses two App Platform components. `prometheus-web` serves the Angular build at `/`, and `prometheus-api` serves the NestJS backend behind `/api`. DigitalOcean strips the `/api` route prefix before forwarding requests, so the backend keeps its existing routes such as `/login`, `/broker`, and `/matching`.

The frontend production environment uses `apiBaseUrl: "/api/"`. HTTP requests go through the Angular interceptor and become same-origin `/api/...` calls. Socket.IO derives `/api/socket.io` from the same API base URL so realtime notifications continue to work behind the ingress route.

## Runtime Configuration

The backend listens on `PORT` first, then `API_PORT`, then `3100`. This keeps DigitalOcean compatibility while preserving local `.env` behavior.

Both packages pin Node 18 and npm 9 through `engines` so App Platform does not pick a newer runtime that is outside Angular 16's supported range.

## Deployment Template

`.do/app-staging.template.yaml` is a placeholder template, not a secrets file. It includes the backend service, frontend static site, `/api` ingress, and the environment variables that must be filled in DigitalOcean.

## Testing

Deployment prep is verified by:

- Backend runtime-port tests.
- Existing backend geocode and matching assistant tests.
- Frontend Socket.IO endpoint tests.
- Backend build.
- Frontend production build.

## Out Of Scope

This design does not make the app production-ready. Production requires real domains, production MongoDB backup policy, Stripe and email production credentials, provider credentials, file-storage hardening, and a final security pass.
