# DigitalOcean Staging Prep

Last updated: June 29, 2026

## Current Target

Prometheus is ready for a private DigitalOcean staging deployment after the June 29 broker/carrier smoke test. The staging target is:

- DigitalOcean App Platform
- One Node.js service for `prometheus-backend`
- One static site for `prometheus`
- DigitalOcean Managed MongoDB
- Same-origin API routing through `/api`

The Angular production build uses `apiBaseUrl: "/api/"`. The App Platform ingress routes `/api` to the backend and `/` to the static site. Socket.IO uses `/api/socket.io` in this mode.

## Required DigitalOcean Setup

1. Create a private GitHub repository and push this branch.
2. Create a DigitalOcean Managed MongoDB database.
3. Create an App Platform app from `.do/app-staging.template.yaml`.
4. Replace all `REPLACE_WITH_...` placeholders in the DigitalOcean UI or in a private copy of the app spec.
5. Keep `PROMETHEUS_SANDBOX_PROVIDERS=1` for staging until real provider credentials are connected.

## Required Runtime Secrets

- `DB_URI`: DigitalOcean Managed MongoDB connection string.
- `JWT_SECRET`: long random JWT signing secret.
- `SIGNATURE_KEY`: exactly 32 characters for current AES usage.
- `STRIPE_API_KEY`: Stripe test key for staging.
- `STRIPE_WEBHOOKS_KEY`: Stripe webhook signing secret.
- `MAIL_USER` and `MAIL_PASSWORD`: SMTP credentials.
- `OPENAI_API_KEY`: Prometheus-managed Brain Pro key, unless staging is BYOI only.
- `GOOGLE_MAPS_API_KEY` and `AgmCoreModule`: optional for live map/routing provider tests.

## Required Public Values

- `APP_URL`: staging web URL, for example `https://prometheus-staging.example.com`.
- `STRIPE_RETURN_URL`: staging workspace URL, for example `https://prometheus-staging.example.com/workspace`.
- `SUPPORT_EMAIL`
- `SUPPORT_PHONE`
- `PROJECT_NAME=Prometheus`
- `JWT_EXPIRATION=30d`
- `FMCSA_AUTHORITY_VALIDATION=datahub`
- `OPENAI_MODEL`: chosen Brain Pro model for the staging account.

## Verification Before Deploy

Run locally before each staging deploy:

```powershell
cd C:\Prometheus-Clean\prometheus-backend
npm test -- config/runtime-port.spec.ts app.controller.spec.ts matching/agent-command-parser.spec.ts matching/agent-command.service.spec.ts --runInBand
npm run build

cd C:\Prometheus-Clean\prometheus
npx ng test --include src/app/core/realtime/socket-endpoint.spec.ts --watch=false --browsers=ChromeHeadless
npm run build
```

## Staging Smoke Test

After deployment:

1. Open the staging URL.
2. Sign in with a staging admin account.
3. Confirm `/api/health-check` returns `OK`.
4. Create or seed broker and carrier helper accounts.
5. Post a broker load.
6. Post a carrier truck.
7. Run matching snapshots from the UI.
8. Search `show available trucks in WA`.
9. Search `search loads in IL` from a carrier account.
10. Try `book match 1` and confirm Prometheus creates an approval request, not an automatic external action.

## Production Is Separate

This prep supports private staging. Production still needs:

- Real domain and SSL confirmation.
- Production MongoDB backup policy.
- Production Stripe webhook and subscription validation.
- Real email sender domain.
- Final provider credentials.
- Storage decision for authority files and setup documents.
- Security review for CORS, rate limits, secrets, and admin access.
