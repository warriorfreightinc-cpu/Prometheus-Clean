# Prometheus Delivery Roadmap To DigitalOcean

Last updated: April 29, 2026

## Current Status

- Local project is recovered in `C:\Prometheus-Clean`.
- Git repository is initialized with a recovery checkpoint.
- Hybrid onboarding master review board is implemented locally.
- Company setup-after-approval is implemented locally.
- Next approved direction is Option C: finish the operating core before Stripe and DigitalOcean.
- Local backend and frontend have working development ports:
  - Backend: `http://localhost:3100`
  - Frontend: `http://localhost:4300`

## Recommended Path

Use a **DigitalOcean Droplet first** for the private production/staging launch. It gives us the most control for the NestJS backend, Angular static frontend, WebSocket traffic, MongoDB connection, logs, file uploads, and the local-to-production migration.

Once the product is stable, we can move pieces to managed services:

- DigitalOcean Managed MongoDB for database reliability.
- DigitalOcean Spaces for uploaded onboarding documents and future file storage.
- DigitalOcean App Platform later if we want less server maintenance.

## What Is Left Before First Private Deployment

### 1. Finish Operations Core Matching And Booking

Build the real broker/carrier operating workflow:

- Real ranked matching agent using persisted match snapshots.
- Broker and carrier match cards with score, reasons, and route/deadhead metrics.
- Direct room lifecycle: open, negotiating, booked, cancelled, delivered.
- Human-approved booking confirmation.
- Load creation only from booked rooms.
- ChatBB action suggestions with user approval before messages, bids, booking, tracking, or cancellation.
- Loads Console polish for active, library, ready-to-bill, and archived states.

Estimated time: **2 to 4 working days**

### 2. Stripe Production Billing

Turn local setup/payment behavior into production billing:

- Real Stripe checkout.
- Stripe webhook activation.
- Subscription status sync.
- Seat enforcement tied to paid quantity.
- Payment failure/deactivation behavior.
- Customer portal for subscription management.

Estimated time: **1 to 2 working days**

### 3. Production Configuration Cleanup

Prepare production-safe configuration:

- Create exact production `.env.example` checklist.
- Confirm JWT secret, MongoDB URI, frontend URL, backend URL, Stripe keys, email credentials, OpenAI or local AI provider settings.
- Remove or guard local demo-only behavior.
- Make sure uploaded files and generated local data do not deploy by accident.

Estimated time: **2 to 3 hours**

### 4. GitHub Remote Backup And Deployment Source

Local Git protects the machine, but a remote repo protects the project from a wiped drive.

- Create private GitHub repository.
- Push `main`.
- Push feature branches as we work.
- Confirm `.env`, logs, `node_modules`, and local browser state are ignored.

Estimated time: **30 to 60 minutes**

### 5. DigitalOcean Server Setup

Create the production/staging server:

- Ubuntu Droplet.
- Node.js LTS.
- Nginx reverse proxy.
- PM2 for backend process management.
- Firewall rules.
- Domain or temporary server IP routing.
- SSL certificate with Let's Encrypt once domain is attached.

Estimated time: **2 to 4 hours**

### 6. Database And Storage

Choose the first deployment database path:

- Fast path: MongoDB on the Droplet for staging.
- Better production path: DigitalOcean Managed MongoDB.

Then configure:

- Database backups.
- Database user/password.
- Network access.
- Seed script behavior for staging only.
- File upload storage path or Spaces migration.

Estimated time:

- Droplet MongoDB staging: **1 to 2 hours**
- Managed MongoDB production: **2 to 4 hours**

### 7. Production Build And Release Script

Create repeatable deployment commands:

- Backend install/build/start.
- Frontend install/build.
- Nginx serve Angular build.
- PM2 restart backend.
- Health check script.
- Rollback notes.

Estimated time: **2 to 3 hours**

### 8. Smoke Testing On The Live Server

Verify the complete core flow:

- Sign in.
- Master account sees onboarding queues.
- Pending company can be approved.
- Company admin sees setup.
- Payment/local staging activation works.
- Company admin can create users.
- Active company can access workspace features.
- Basic broker/carrier posting still works.

Estimated time: **2 to 4 hours**

## Practical Time Estimate

Best case for a private working DigitalOcean staging deployment after Operations Core:

**1 long day, about 10 to 14 focused hours.**

Safer estimate with testing, deployment docs, and fixing surprises:

**2 to 3 working days.**

Production-ready estimate from the current state, including Operations Core, Stripe, real email domain, managed database, backups, SSL, and safer document storage:

**6 to 10 working days.**

## Next Execution Order

1. Finish Operations Core Matching And Booking.
2. Commit that milestone.
3. Finish Stripe production billing.
4. Push project to a private GitHub remote.
5. Create production `.env` checklist.
6. Build DigitalOcean staging server.
7. Deploy backend and frontend.
8. Run live smoke tests.
9. Decide what must be hardened before opening it to real users.

