# Company Setup After Approval Design

## Purpose

After the master account approves paperwork, the company moves to `approved_waiting_setup`. The next product slice should give the company admin a focused setup experience that turns an approved company into an active company.

This closes the flow:

`signup -> paperwork review -> master approval -> company setup -> active workspace access`

## Current Context

The project already has:

- Public company signup with document upload.
- A master onboarding board with Pending, Waiting setup, Active, and Inactive / deleted tabs.
- Canonical company statuses including `approved_waiting_setup` and `active`.
- Stripe subscription endpoints under `/subscriptions`.
- User creation endpoints under `/users`.
- Login/session guards that block operational users unless the company is active.

The missing piece is the company admin setup surface after approval.

## User Roles

### Company Admin

The company admin is the first admin created during signup. When their company is `approved_waiting_setup`, they should see only the setup console, not dispatch, matching, loads, or direct chat.

The company admin can:

- See company approval status.
- Confirm or adjust seat count.
- Start subscription checkout when Stripe is configured.
- Use a local demo activation action while developing without live Stripe.
- Create company users only after the company becomes `active`.

### Master Account

The master account keeps using the onboarding board. Waiting setup should show whether setup email was sent, requested seats, paid seats, and current company status.

## Recommended First Version

Build a focused **Company Setup Console** inside the existing workspace shell.

For `admin` users:

- If company status is `approved_waiting_setup`, show only setup.
- If company status is `active`, show normal operational workspace and a simple company users area later.
- If company status is `pending_review`, `correction_needed`, `inactive`, or `deleted_pending_purge`, show a blocked status panel with the next expected action.

## Setup Console Layout

The setup console should have three visual sections.

### 1. Approval Summary

Shows:

- Company name.
- Status.
- Requested seats.
- Approved date if available.
- Setup email sent date if available.

Purpose:

- The company admin understands they are approved, but not yet active.

### 2. Payment And Seat Setup

Shows:

- Seat count input, defaulting to `onboarding.requestedSeats`.
- `Start payment` button for the real Stripe checkout flow.
- `Activate locally` button for development only.

Behavior:

- `Start payment` calls existing `/subscriptions` checkout.
- `Activate locally` calls a new local-only backend endpoint that marks the company active and writes a subscription quantity.
- Local activation should be guarded so it works only when `ALLOW_LOCAL_SETUP_ACTIVATION=true` or when Stripe is using local placeholder keys.

### 3. User Setup

Once company status is active:

- Show existing company users.
- Show created seats versus paid seats.
- Allow creating broker/carrier/manager users up to paid seat count.

First version can keep user creation basic:

- First name.
- Last name.
- Email.
- Phone.
- Role.

Password creation can use the existing email/password creation flow.

## Backend Design

Add a setup API surface that is company-admin focused:

- `GET /company/setup/status`
  - Returns company status, onboarding summary, subscription quantity, and active user count.

- `POST /company/setup/local-activate`
  - Body: `{ quantity: number }`
  - Allowed only for `admin`.
  - Allowed only for companies in `approved_waiting_setup`.
  - Writes:
    - `status: "active"`
    - `onboarding.status: "active"`
    - `subscription.quantity`
    - `subscription.lastPayment`
    - `subscription.endPeriod`
    - demo customer marker if no Stripe customer exists.

Use existing endpoints where possible:

- Existing `/subscriptions` remains the real checkout path.
- Existing `/users` remains the user creation path, but the frontend should make it visible only after active status.

## Frontend Design

Add a new Angular component:

- `CompanySetupConsoleComponent`

Wire it into `WorkspaceComponent`:

- Superadmin sees only Master Onboarding.
- Admin with `approved_waiting_setup` sees only Company Setup.
- Admin with blocked statuses sees status guidance.
- Broker/carrier/manager users keep operational tabs when their company is active.

Add API methods:

- `getCompanySetupStatus()`
- `localActivateCompany(quantity)`
- `getCompanyUsers()`
- `createCompanyUser(payload)`

The UI should stay visual:

- Status cards.
- Seat meter.
- Payment/setup action panel.
- User list with role/status chips.

## Error Handling

- If local activation is disabled, show a clear message that Stripe setup is required.
- If seat quantity is less than 1, reject it.
- If company is not `approved_waiting_setup`, reject local activation.
- If user creation exceeds paid seats, keep existing backend block and show the error in the setup console.
- If payment checkout cannot start because Stripe keys are placeholders, offer local activation in development.

## Testing Plan

Backend tests:

- Setup status returns company setup data for admin.
- Local activation fails when company is not `approved_waiting_setup`.
- Local activation fails when quantity is invalid.
- Local activation succeeds and moves company to `active`.
- Local activation updates subscription quantity and end period.

Frontend build checks:

- Angular build passes.
- Admin setup console compiles under strict templates.

Manual smoke:

1. Login as superadmin.
2. Approve `Pending Carrier Review`.
3. Login as that company admin or seeded waiting setup admin.
4. See Company Setup, not operational workspace.
5. Activate locally with a seat count.
6. Confirm company becomes active.
7. Confirm operational workspace is available after refresh/login.

## Success Criteria

- Approved companies have a clear setup path.
- Company admins cannot use operations before activation.
- Local development can complete setup without real Stripe.
- The production path still uses Stripe checkout.
- Paid seat quantity controls user creation.

## Spec Self-Review

- No placeholder requirements remain.
- The design focuses only on setup after approval, not full billing history or advanced user administration.
- The backend uses existing subscription and user systems where possible.
- Local activation is explicitly guarded so it does not become an accidental production bypass.
