# Prometheus Activation Roadmap

This is the remaining path from local sandbox to an active operational system.

## Phase 0 - Lock The Current Working Version

Goal: preserve the working state before connecting real outside systems.

Steps:
1. Keep the current project backup.
2. Run frontend and backend builds.
3. Run the main workspace tests.
4. Confirm local demo accounts can sign in.
5. Confirm broker and carrier can complete the local test flow.

Ready when:
- Local frontend opens.
- Backend health check passes.
- Broker and carrier test accounts can use AI Transportation Center, Direct Chat, Loads Console, import, booking, tracking preview, and route map preview.

## Phase 1 - Finish Sandbox Operations

Goal: make all workflows feel real before provider credentials are added.

Steps:
1. Test broker posts a load.
2. Test carrier posts a truck.
3. Test Prometheus finds and describes matches.
4. Test booking approval from both sides.
5. Test Booking Chat active buttons:
   - Get setup
   - Assign driver
   - Add contact
   - Track
   - Route map
   - Delivered
   - Cancel load
6. Test imported CSV/text rows become draft posts and require `approve import`.
7. Test coworker load access request and approval.
8. Test fake provider previews for setup/tracking.

Ready when:
- One full fake shipment can move from post to match to booking to active load to ready-to-bill.

## Phase 2 - Google Maps And Route Activation

Goal: replace the current offline route preview with real map and route support.

Accounts to create:
- Google Cloud account
- Google Cloud project for Prometheus
- Billing profile with strict budget alerts

Provider setup:
1. Enable required Google APIs:
   - Maps JavaScript API
   - Geocoding API
   - Routes API or Distance Matrix API
   - Places API if autocomplete is needed
2. Create API keys.
3. Restrict browser key by domain/referrer.
4. Restrict backend key by server/IP where possible.
5. Add keys to environment variables:
   - `GOOGLE_MAPS_API_KEY`
   - `AgmCoreModule` if legacy endpoints still use it

App work:
1. Keep fallback route preview when keys are missing.
2. Add live map rendering when key exists.
3. Add real route alternatives and ETA when provider is connected.
4. Show provider status inside Route Intelligence.

Ready when:
- Route map works with no key in sandbox mode.
- Route map upgrades to Google when key is present.
- No key is committed into the repository.

## Phase 3 - Email Activation

Goal: let Prometheus draft and send broker/carrier emails after human approval.

Accounts to create:
- One email provider account:
  - Google Workspace/Gmail
  - Resend
  - SendGrid
  - Mailgun
  - SMTP account

Provider setup:
1. Decide sender domain or mailbox.
2. Verify domain if using a transactional provider.
3. Add SMTP/API credentials to environment.
4. Keep Mailpit for local testing.

App work:
1. Keep approval card before sending.
2. Add real provider send after approval.
3. Store sent email history in the room/contact.
4. Add fallback draft when provider is missing.

Ready when:
- Local email goes to Mailpit.
- Production/test email sends only after approval.
- Sent message is visible in the Direct Chat / Main Chat record.

## Phase 4 - CH Robinson / Load Board Activation

Goal: let Prometheus open, draft, or book against CH Robinson only when the user has connected access.

Accounts to create:
- CH Robinson / Navisphere account
- Developer/API access if available
- Test/sandbox account if CH Robinson provides one

Provider setup:
1. Store credentials in environment or secret manager:
   - `CH_ROBINSON_API_KEY`
2. Define access mode:
   - Manual/deep-link mode first
   - API search/book mode later if approved

App work:
1. Add provider status in Company Integrations.
2. Add "open in CH Robinson" action when connected.
3. Add approval before any booking attempt.
4. If not connected, draft broker email instead.

Ready when:
- Connected account shows active.
- Missing account shows clear fallback.
- No booking happens without human approval.

## Phase 5 - Tracking / ELD Activation

Goal: turn tracking from a sandbox flag into live location status.

Accounts to create:
- Choose first tracking provider:
  - MacroPoint
  - FourKites
  - Samsara
  - Motive
  - Geotab

Provider setup:
1. Get sandbox or API credentials.
2. Add credentials to environment:
   - `MACROPOINT_API_KEY`
   - `FOURKITES_API_KEY`
   - `SAMSARA_API_TOKEN`
   - `MOTIVE_API_KEY`
   - `GEOTAB_USERNAME`
   - `GEOTAB_PASSWORD`
3. Define what counts as live tracking:
   - provider connected
   - truck assigned
   - location received
   - broker permission granted if required

App work:
1. Connect Booking Chat Track button to provider adapters.
2. Feed live location into Route map.
3. Show tracking state:
   - not connected
   - connected
   - live
   - stale
4. Alert when tracking is missing or stale.

Ready when:
- Tracking button can connect provider.
- Route map shows truck location when available.
- Missing tracking creates an operational warning.

## Phase 6 - Carrier Setup Provider Activation

Goal: use real setup platforms instead of sandbox setup cards.

Accounts to create:
- Highway
- MyCarrierPacket
- Truckstop/RMIS-style setup provider

Provider setup:
1. Add credentials:
   - `HIGHWAY_API_KEY`
   - `MYCARRIERPACKET_API_KEY`
   - `TRUCKSTOP_API_KEY`
2. Decide provider priority per company.
3. Keep manual setup fallback.

App work:
1. Show connected setup providers in Company Integrations.
2. Let Booking Chat Get setup choose connected provider.
3. Store setup result/status in the booking workflow.

Ready when:
- Setup can be staged from Booking Chat.
- Provider result is saved.
- Manual fallback still works.

## Phase 7 - Import / TMS Activation

Goal: bring loads/trucks from company systems, emails, spreadsheets, and pictures.

Accounts or access to create:
- Company TMS test/export account
- Shared broker email inbox if importing emails
- OCR provider if picture/PDF parsing is needed

Provider setup:
1. Start with CSV/text import.
2. Add Excel parser.
3. Add OCR for screenshots/PDFs.
4. Add TMS API connector after the company chooses a TMS.

App work:
1. Add field review screen before posting.
2. Support column mapping.
3. Keep `approve import` before anything goes live.
4. Save import source and audit trail.

Ready when:
- CSV/text import works.
- Excel import works.
- Picture/PDF import creates reviewable drafts.
- TMS import creates reviewable drafts.

## Phase 8 - Security, Roles, And Audit

Goal: make live provider use safe for real companies.

Steps:
1. Store secrets outside git.
2. Restrict provider actions by role.
3. Require approval for:
   - booking
   - sending email
   - starting setup
   - enabling tracking
   - importing live posts
4. Record audit history for each external action.
5. Verify company data isolation.

Ready when:
- Broker/carrier/admin permissions behave correctly.
- Every external action has an audit trail.

## Phase 9 - Deployment

Goal: move from local test to hosted test environment.

Accounts to create:
- Hosting account, likely DigitalOcean based on the delivery roadmap
- MongoDB hosting or managed database
- Domain/DNS account
- SSL/HTTPS setup
- Error/log monitoring

Steps:
1. Create staging environment.
2. Add environment variables.
3. Run seed accounts.
4. Run smoke tests.
5. Configure backups.
6. Configure logs and health checks.

Ready when:
- Staging URL works.
- Sign-in works.
- Provider sandbox connections work.
- Backup and rollback path exists.

## Phase 10 - Operational Acceptance Test

Goal: prove Prometheus can run the real business flow.

Test flow:
1. Broker posts or imports a load.
2. Carrier posts or imports a truck.
3. Prometheus matches them.
4. Broker and carrier approve booking.
5. Booking Chat opens.
6. Setup is completed.
7. Driver is assigned.
8. Tracking is connected.
9. Route map opens.
10. Load is marked delivered.
11. Load moves to Ready to bill.
12. Admin/coworker access is tested.

Ready when:
- A broker and carrier can run this flow without developer help.

## Recommended Order

1. Finish local sandbox test.
2. Connect Google Maps.
3. Connect email sending.
4. Connect one tracking provider.
5. Connect one setup provider.
6. Connect CH Robinson / first load board.
7. Add Excel and picture OCR import.
8. Add TMS integration.
9. Deploy staging.
10. Run full acceptance test.
