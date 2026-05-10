# PromethAIs Backend

Standalone NestJS backend for the PromethAIs operations application.

## What This Folder Is

This backend is the local API service for the PromethAIs operations platform.

The immediate goal is a clean local development boundary:

- Frontend: `C:\Prometheus-Clean\prometheus`
- Backend: `C:\Prometheus-Clean\prometheus-backend`

## Current Boundary

- API port: `3100`
- Frontend dev port: `4300`
- Swagger: `http://localhost:3100/api`
- Static uploads served from `/files`

## Local Run

```bash
npm install
npm run start:dev
```

The default local `.env` keeps the development database connection outside Git.

## Next Cleanup Targets

- Separate database/runtime assets if Prometheus needs its own data boundary
