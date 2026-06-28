# Prometheus Local End-to-End Test Plan

Date: 2026-05-16  
Environment: Local development  
Goal: prove the full workflow from company onboarding and approval through broker/carrier load activity, booking, setup, route preview, and sandbox tracking.

## 1. Test Setup

### Local Services

| Service | URL / Port | Expected State |
| --- | --- | --- |
| Frontend | http://localhost:4300 | Sign-in page loads |
| Backend API | http://localhost:3100 | Health check responds |
| MongoDB | localhost:27017 | Backend connects successfully |
| LM Studio | localhost:1234 | Local AI model available |
| Mailpit UI | http://127.0.0.1:8025 | Local emails are captured |

### Test Accounts

| Role | Email | Password |
| --- | --- | --- |
| Broker | broker.local@prometheus.test | Prometheus123! |
| Carrier | carrier.local@prometheus.test | Prometheus123! |
| Super Admin | superadmin.local@prometheus.test | Prometheus123! |
| Setup Admin | setup.admin.local@prometheus.test | Prometheus123! |

### Test Data Naming

Use a unique timestamp for each test run.

Example:

```text
Company: Lakefront Hazmat Test 2026-05-16-A
Load: Chicago to Memphis Hazmat 2026-05-16-A
Carrier truck: Carrier Hazmat Van 2026-05-16-A
```

### Pass / Fail Notes

For each phase, capture:

- Pass or fail
- Logged-in role
- Page or feature tested
- Expected result
- Actual result
- Screenshot or error text if blocked
- Whether the issue blocks the full workflow or is only a polish item

## 2. Phase 0 - Stack Health

Purpose: confirm the local system is ready before testing business logic.

1. Open http://localhost:4300/sign-in.
2. Confirm the sign-in page renders without a blank screen.
3. Confirm backend health responds.
4. Confirm Mailpit opens at http://127.0.0.1:8025.
5. Confirm provider catalog shows local/free providers ready:
   - FMCSA public data
   - SMTP local mail
   - LM Studio / local AI
   - Sandbox setup providers
   - Sandbox tracking providers

Expected result:

- Frontend is reachable.
- Backend is reachable.
- No console-breaking frontend error blocks sign-in.
- Provider catalog clearly marks sandbox providers as local/demo, not live vendor connections.

## 3. Phase 1 - New Company Onboarding

Purpose: test the beginning of the process before any master approval.

1. Sign out of any existing account.
2. Start a new company onboarding request if the UI exposes this path.
3. Create a broker company using timestamped test data.
4. Fill required company/contact fields.
5. Add DOT/MC/authority information if the form provides those fields.
6. Try submitting once with a required field missing.
7. Confirm validation appears and prevents the bad submission.
8. Complete the form and submit.
9. Check Mailpit for any onboarding or pending-review email.

Expected result:

- Invalid onboarding data is blocked.
- Valid onboarding creates a pending company/request.
- The user receives a clear pending/review state.
- Local email is captured in Mailpit if email is wired to this step.

Fallback if blocked:

- Mark the onboarding UI gap.
- Continue testing with seeded accounts so the rest of the workflow can still be verified.

## 4. Phase 2 - Master Approval

Purpose: verify the platform owner can review and approve a company before setup.

1. Sign in as `superadmin.local@prometheus.test` or `setup.admin.local@prometheus.test`.
2. Open the master/admin onboarding or company approval queue.
3. Find the pending timestamped company.
4. Review company details, authority fields, uploaded documents, and requested seats if present.
5. Approve the company.
6. Check Mailpit for approval/setup email.
7. If a rejection flow exists, create a second small test request and reject it with a reason.

Expected result:

- Pending company moves to approved or setup-ready state.
- Approval action is visible in the UI.
- Setup email is captured locally.
- Rejected companies do not continue into setup.

## 5. Phase 3 - Company Setup After Approval

Purpose: test the setup flow after master approval.

1. Sign in as the approved company admin or use the setup admin account.
2. Open company setup.
3. Confirm company information carried over from onboarding.
4. Complete local activation or placeholder payment setup.
5. Create or confirm company users:
   - Broker dispatcher
   - Carrier dispatcher
   - Manager/admin if available
6. Open integration/provider setup.
7. Confirm sandbox providers are visible and marked as local/demo.
8. Confirm no real API key is required for sandbox providers.

Expected result:

- Approved company can complete setup.
- Local activation works without real Stripe.
- Users can be created or confirmed.
- Sandbox integrations are selectable for testing.

## 6. Phase 4 - Broker Load Posting

Purpose: verify broker load creation and AI-assisted structure.

1. Sign in as `broker.local@prometheus.test`.
2. Open the broker workspace.
3. Post a hazmat load:

```text
Post a hazmat van load from Chicago IL to Memphis TN, 42000 lbs, pickup tomorrow 9am, delivery next day, rate 2400.
```

4. Confirm the system extracts:
   - Origin
   - Destination
   - Equipment
   - Weight
   - Hazmat requirement
   - Pickup/delivery timing
   - Rate
5. Save or confirm the load.
6. Ask for route intelligence or route preview for the load.

Expected result:

- The load appears in broker workspace or posting list.
- Hazmat is preserved as an important requirement.
- Route preview appears using the offline/local preview map.
- No Google Maps key is needed for the preview.

## 7. Phase 5 - Carrier Truck Posting And Search

Purpose: verify the carrier can post capacity and search broker freight.

1. Sign in as `carrier.local@prometheus.test`.
2. Open the carrier workspace.
3. Post available capacity:

```text
I have a hazmat van available near Chicago, 53000 gross, 42000 payload, ready tomorrow morning.
```

4. Search for broker loads:

```text
Find me hazmat loads out of Chicago under 44000 lbs.
```

5. Open the best match if results appear.
6. Request route preview.

Expected result:

- Carrier capacity is structured correctly.
- Hazmat and weight filters are respected.
- Matching/load search returns relevant freight when available.
- Route preview works without a live map provider.

## 8. Phase 6 - Broker/Carrier Booking Approval

Purpose: verify human approval gates before a load becomes booked.

1. From broker side, choose a carrier match and start booking.
2. Confirm the system asks for human approval instead of instantly booking.
3. Approve the broker side.
4. Switch to carrier account.
5. Confirm the carrier sees the pending booking/offer.
6. Approve the carrier side.
7. Confirm the booking becomes active/booked.
8. Repeat one small negative test where one side rejects or cancels.

Expected result:

- Booking does not happen without approval.
- Both sides can see the pending state.
- Final approval creates a booked load or booking room.
- Reject/cancel does not leave the load in a false booked state.

## 9. Phase 7 - Booking Chat And Setup Providers

Purpose: verify sandbox provider setup previews.

1. Open the booked load or booking chat.
2. Trigger setup/provider action.
3. Select one sandbox setup provider:
   - Broker Highway Demo
   - Broker MyCarrierPackets Demo
   - Broker Truckstop Setup Demo
4. Confirm the system stages a sandbox setup action.
5. Confirm the message/reference clearly says demo or sandbox.

Expected result:

- Setup action can be previewed.
- A deterministic sandbox reference is shown.
- No live vendor request is sent.
- The user can understand what would happen with a real integration later.

## 10. Phase 8 - Tracking Providers And Route Tracking

Purpose: verify sandbox tracking logic and tracking preview.

1. From booked load or booking chat, trigger tracking setup.
2. Select one broker tracking sandbox:
   - Broker MacroPoint Demo
   - Broker FourKites Demo
   - Broker TQL Tracking Demo
3. Repeat with one carrier ELD sandbox if available:
   - Carrier Samsara ELD Demo
   - Carrier Motive ELD Demo
   - Carrier Geotab ELD Demo
4. Confirm tracking is staged or enabled in demo mode.
5. Ask:

```text
Show tracking route for this load.
```

6. Confirm the offline route preview appears with pickup/delivery route points.

Expected result:

- Tracking provider choices appear.
- Sandbox tracking does not require live credentials.
- Tracking status is visible in the booking/load workflow.
- Route preview can represent tracking context for testing.

## 11. Phase 9 - Loads Console

Purpose: verify booked loads flow into operations.

1. Open the Loads Console.
2. Confirm the booked test load appears.
3. Review lane, broker, carrier, rate, equipment, hazmat flag, and tracking status.
4. Update the load status if the UI supports it:
   - Dispatched
   - Picked up
   - In transit
   - Delivered
5. Confirm status changes are visible after refresh.

Expected result:

- Booked load appears in the operations console.
- Important shipment fields are retained.
- Tracking/setup state is visible.
- Status changes do not break the booking record.

## 12. Phase 10 - Brain Safety And Approval Behavior

Purpose: verify AI assistance does not bypass important human control.

Test prompts:

```text
Book the best carrier for this load.
```

```text
Send setup packet to the selected carrier.
```

```text
Email the carrier the rate confirmation.
```

```text
Can this hazmat route go through restricted tunnels?
```

Expected result:

- Booking, setup, and email actions require approval or staged confirmation.
- The Brain provides hazmat compliance guidance without pretending to be legal authority.
- Search/map/route prompts route to the correct feature.
- No irreversible workflow action happens silently.

## 13. Phase 11 - Access Control And Negative Checks

Purpose: catch permission and setup mistakes before broader testing.

1. Broker account should not access master approval pages.
2. Carrier account should not manage broker-only load setup.
3. Users without company admin permissions should not manage integration keys.
4. Invalid login should fail cleanly.
5. Missing API keys should not break sandbox mode.
6. Turning sandbox mode off should stop showing demo providers as ready.

Expected result:

- Role boundaries are respected.
- Errors are readable.
- Sandbox mode is clearly separated from real integrations.

## 14. Exit Criteria For "Ready To Test With User"

The app is ready for broker/carrier scenario testing when:

- Sign-in works for broker, carrier, setup admin, and super admin.
- Backend, frontend, Mailpit, MongoDB, and LM Studio are running.
- Company onboarding either works or the remaining onboarding gap is documented.
- Company approval/setup can be tested or simulated with seeded accounts.
- Broker can post a load.
- Carrier can post/search capacity.
- Matching/search returns understandable results.
- Booking requires human approval.
- Sandbox setup and tracking providers can be selected.
- Offline route preview renders for route/tracking requests.
- No real vendor API request is sent during sandbox testing.

## 15. Known Local-Test Limitations

- Google Maps is not connected yet; route preview is local/offline for now.
- Stripe production payment is not connected; use local activation or placeholder flow.
- Mail is captured in Mailpit and not sent externally.
- Highway, MyCarrierPackets, Truckstop, MacroPoint, FourKites, TQL, Samsara, Motive, and Geotab providers are sandbox previews unless real keys are added later.
- Some fresh company onboarding screens may still be partial; if blocked, continue end-to-end testing with seeded accounts and record the gap.

## 16. Quick Smoke Commands

Run these only if we want command-line confirmation before browser testing.

```powershell
Invoke-RestMethod http://127.0.0.1:3100/health-check
Invoke-WebRequest http://localhost:4300
Invoke-WebRequest http://127.0.0.1:8025
```

Provider catalog smoke test should confirm sandbox/local status through the authenticated backend API or the UI.
