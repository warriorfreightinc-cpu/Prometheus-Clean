# Hybrid Company Onboarding Design

## Purpose

Prometheus needs a controlled onboarding system where a master account can review carrier and broker paperwork, approve legitimate companies, move approved companies into payment/setup, keep active companies healthy, and remove bad or abandoned accounts. The chosen direction is a hybrid verification model: Prometheus supports local manual approval now and stores verification records in a way that can later accept Highway or another provider as the verification source.

## Existing Project Context

The current backend already has the foundation for this flow:

- Company signup creates a company in `draft` status.
- Signup uploads MC authority, insurance certificate, and HAZMAT authority files into the current company file flow.
- Company status currently uses values such as `draft`, `pending`, `activated`, and `deactivated`.
- Company records already store `filesUploaded`, `filesNames`, `notes`, `subscription`, `isWaiting`, `adminId`, `type`, DOT, MC, contact person, and address.
- User roles already include `superadmin`, `supervisor`, `admin`, `broker`, `carrier`, and `manager`.
- The company admin user is created during signup.
- Stripe subscription code already moves companies into an active state after payment.
- Email sending already exists for approval, supervisor notification, password creation, and document expiration reminders.

This design extends those pieces rather than creating a separate onboarding system.

## Roles

### Master Account

The master account is the highest Prometheus account. In code this should map to `superadmin`.

The master account can:

- See all company applications.
- Review uploaded paperwork.
- Approve paperwork.
- Request corrected paperwork.
- Move companies to inactive.
- Restore inactive companies.
- Soft-delete companies.
- Permanently delete companies after confirmation.
- Edit company metadata and document expiration dates when fixing issues.
- View the full audit trail for each company.

### Internal Support Account

The existing `supervisor` role can help with review and support tasks, but the final destructive actions should remain master-only.

Supervisor can:

- View onboarding queues.
- Review paperwork.
- Add notes.
- Request corrections.
- Mark documents as verified or rejected.

Supervisor should not:

- Permanently delete companies.
- Delete all company users.
- Override payment status.

### Company Admin Account

The first account created during onboarding is the company admin. This maps to the existing `admin` role.

Company admin can:

- Complete payment/setup after paperwork approval.
- Select paid seat quantity.
- Create company users up to the paid seat quantity.
- Disable or remove company users.
- Manage billing portal access.
- Post/search/book using the company access type.

Company admin cannot:

- Access the master onboarding console.
- Approve its own paperwork.
- Permanently delete the company from Prometheus.
- See other companies' private setup details.

### Company User Accounts

Company users are operational users created by the company admin. They map to the existing `broker`, `carrier`, and `manager` roles.

Operational users can:

- Post loads or trucks allowed by the company type.
- Search loads or trucks.
- Use matching, direct chat, and booking tools.
- Manage assigned work.

Operational users cannot:

- Manage payment.
- Approve onboarding.
- Create more users unless assigned a management role that already supports user creation.

## Company Lifecycle

The onboarding lifecycle should use the following canonical company statuses.

### `draft`

The company started signup but has not submitted the complete onboarding request.

Entry:

- Public signup creates the company record.

Allowed actions:

- Applicant edits company profile.
- Applicant uploads required documents.
- Applicant creates the first company admin account.
- Applicant submits for review.
- Applicant abandons or deletes the draft.

Exit:

- Submit complete application -> `pending_review`.
- Applicant deletes draft -> soft delete or remove draft data.

### `pending_review`

The company submitted the onboarding request and is waiting for paperwork review.

Entry:

- Applicant clicks Submit company request.

Allowed actions:

- Master/supervisor previews uploaded files.
- Master/supervisor enters expiration dates.
- Master/supervisor marks each document verified or rejected.
- Master/supervisor approves paperwork if required documents are valid.
- Master/supervisor requests corrections if documents are missing, expired, mismatched, or unreadable.

Exit:

- All required documents verified and approval clicked -> `approved_waiting_setup`.
- Any required document rejected and correction email sent -> `correction_needed`.
- Master rejects company -> `inactive`.
- Master soft-deletes abandoned or fraudulent application -> `deleted_pending_purge`.

### `correction_needed`

The company has submitted paperwork, but one or more documents need replacement or clarification.

Entry:

- Master/supervisor sends correction request from the pending review screen.

Allowed actions:

- Company admin or applicant uploads corrected documents.
- Master/supervisor reviews corrected documents.
- Notes explain what is wrong and what must be fixed.

Exit:

- Corrected upload submitted -> `pending_review`.
- Master rejects company -> `inactive`.
- Master soft-deletes abandoned application -> `deleted_pending_purge`.

### `approved_waiting_setup`

Paperwork is approved, and the company admin needs to complete payment and user setup.

Entry:

- Master approves paperwork.

Allowed actions:

- System emails company admin with setup link.
- Company admin signs in.
- Company admin completes subscription/payment.
- Company admin selects seat quantity.
- Company admin creates users up to paid seat quantity.
- Master can move company back to review if paperwork was approved by mistake.

Exit:

- Stripe confirms active subscription/payment -> `active`.
- Payment fails or setup is abandoned -> remain `approved_waiting_setup` with a payment issue flag.
- Master suspends company -> `inactive`.

### `active`

The company is approved, paid, and allowed to use Prometheus features.

Entry:

- Subscription/payment is confirmed and required setup is complete.

Allowed actions:

- Company admin manages users and billing.
- Company users post loads/trucks based on company type.
- Company users search, match, chat, book, and manage loads.
- Master can review company health, notes, documents, and payment status.
- Expired required documents can trigger deactivation.

Exit:

- Payment failure -> `inactive`.
- Required document expires -> `inactive`.
- Master suspends company -> `inactive`.
- Master soft-deletes company -> `deleted_pending_purge`.

### `inactive`

The company is blocked from normal Prometheus use but preserved for review, repair, or restoration.

Entry:

- Master suspends company.
- Payment fails.
- Required document expires.
- Paperwork becomes invalid.
- Company behavior is not acceptable.

Allowed actions:

- Master edits company details.
- Master reviews notes and audit trail.
- Master requests new paperwork.
- Master restores company after issue is fixed.
- Master soft-deletes company.

Exit:

- Issue fixed and payment/documents valid -> `active`.
- Requires new paperwork approval -> `pending_review`.
- Master soft-deletes company -> `deleted_pending_purge`.

### `deleted_pending_purge`

The company is removed from normal workflows but held for final review before permanent deletion.

Entry:

- Master selects delete from pending, inactive, or active company details.

Allowed actions:

- Master views summary and audit trail.
- Master restores company.
- Master permanently deletes the company.

Exit:

- Restore -> previous safe status chosen by master.
- Permanently delete -> `purged`.

### `purged`

The company, related users, draft data, and uploaded files are permanently removed.

Implementation note:

- This status may be represented by actual deletion rather than a persisted status. Before deletion, the audit event should be recorded in a master-only audit location if permanent deletion auditing is implemented.

## Master Console Tabs

The master onboarding console should have four tabs.

### Pending Paperwork

Shows:

- Companies with `pending_review`.
- Companies with `correction_needed`.

Primary controls:

- Open company application.
- Preview MC, insurance, and HAZMAT files.
- Enter document expiration date.
- Mark document verified.
- Mark document rejected.
- Add note.
- Request correction.
- Approve paperwork.
- Move to inactive.
- Soft-delete application.

Required display fields:

- Company name.
- Company type.
- DOT.
- MC.
- Contact person.
- Submitted date.
- Document status summary.
- Last reviewer note.

### Waiting Setup

Shows:

- Companies with `approved_waiting_setup`.

Primary controls:

- Resend setup/payment email.
- View setup progress.
- View selected seat quantity.
- View payment status.
- Move back to pending review.
- Move to inactive.
- Soft-delete company.

Required display fields:

- Company name.
- Company admin.
- Approval date.
- Setup email status.
- Payment status.
- Requested or selected users.
- Current created users.

### Active

Shows:

- Companies with `active`.

Primary controls:

- Open company details.
- View users.
- View payment status.
- View document expiration status.
- Add internal note.
- Move to inactive.
- Soft-delete company.

Required display fields:

- Company name.
- Company type.
- Active users.
- Paid seats.
- Subscription status.
- Upcoming document expiration warning.
- Last activity.

### Inactive / Deleted

Shows:

- Companies with `inactive`.
- Companies with `deleted_pending_purge`.

Primary controls:

- Open company details.
- See why company is inactive.
- Fix paperwork issue.
- Fix payment issue.
- Restore company.
- Permanently delete company.

Required display fields:

- Company name.
- Current status.
- Inactive/delete reason.
- Last action date.
- Last master/supervisor note.

Permanent delete must require a confirmation step that clearly shows the company name and explains that users and uploaded files will be removed.

## Hybrid Verification Model

Each required document should have a verification record. The current `filesNames` object can remain as the compatibility layer, but the system should add a structured verification object for future provider integrations.

Recommended company-level structure:

```ts
onboarding: {
  status: string;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  correctionRequestedAt?: Date;
  correctionRequestedBy?: string;
  setupEmailSentAt?: Date;
  requestedSeats?: number;
  previousStatus?: string;
  verificationSummary?: {
    source: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
    status: "pending" | "verified" | "rejected" | "expired";
    checkedAt?: Date;
    checkedBy?: string;
  };
  documents: {
    mc?: OnboardingDocumentVerification;
    insurance?: OnboardingDocumentVerification;
    hazmat?: OnboardingDocumentVerification;
  };
}
```

Recommended document verification structure:

```ts
type OnboardingDocumentVerification = {
  fileType: "mc" | "insurance" | "hazmat";
  displayName: string;
  fileName?: string;
  ext?: string;
  source: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
  status: "missing" | "pending" | "verified" | "rejected" | "expired";
  expirationDate?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  notes?: string;
  providerReference?: {
    provider: string;
    externalId?: string;
    rawStatus?: string;
    lastSyncedAt?: Date;
  };
}
```

Required documents:

- Broker company: MC authority and insurance certificate.
- Carrier company: MC authority, insurance certificate, and HAZMAT authority.
- Carrier and broker company: MC authority, insurance certificate, and HAZMAT authority.

Manual verification behavior:

- Master/supervisor previews the uploaded file.
- Master/supervisor enters expiration date when applicable.
- Master/supervisor marks document verified or rejected.
- System stores `source: "manual"`.
- System stores reviewer id and timestamp.

Future provider verification behavior:

- A Highway-style integration writes into the same verification structure.
- Provider result stores `source: "highway"` and provider reference data.
- Master can still override or add a manual note.
- The UI should show whether the decision came from manual review or provider verification.

## Payment and Seat Setup

Payment setup begins only after paperwork approval.

Flow:

1. Master approves paperwork.
2. Company moves to `approved_waiting_setup`.
3. System sends setup email to the company admin.
4. Company admin signs in and opens setup.
5. Company admin chooses subscription and seat quantity.
6. Stripe checkout or billing portal completes payment.
7. Stripe webhook confirms subscription/payment.
8. Company moves to `active`.
9. Company admin can create users up to paid seat quantity.

Seat rules:

- Company admin counts toward the subscription quantity unless pricing later decides otherwise.
- Regular company users cannot exceed paid seat quantity.
- If seat quantity decreases below current users, extra non-admin users become inactive using the existing decreased-user behavior.
- Master can view seat quantity and active user count in the Active tab.

## Email Rules

### Application Submitted

Recipient:

- Master/support reviewers.

Trigger:

- Company enters `pending_review`.

Purpose:

- Alert that a company is waiting for paperwork review.

### Correction Needed

Recipient:

- Company admin and contact person email.

Trigger:

- Master/supervisor requests correction.

Content:

- Company name.
- Documents needing correction.
- Reviewer note.
- Link back to onboarding.

### Paperwork Approved

Recipient:

- Company admin and contact person email.

Trigger:

- Master approves paperwork.

Content:

- Approval confirmation.
- Setup/payment link.
- Explanation that company becomes active after payment/setup.

### Payment Complete / Company Active

Recipient:

- Company admin.

Trigger:

- Subscription/payment webhook activates company.

Content:

- Company is active.
- Admin can create users.
- Link to workspace/setup.

### Inactive / Suspended

Recipient:

- Company admin.

Trigger:

- Master moves active company to inactive, payment fails, or required document expires.

Content:

- Reason for inactive status.
- Required fix.
- Support contact or setup link.

## Permissions and Feature Access

Access should be checked by company status.

Company users may access the main workspace only when:

- Company status is `active`, or
- Master/supervisor is impersonating/supporting the company where that behavior already exists.

Company admin may access setup while:

- Company status is `approved_waiting_setup`.
- Company status is `correction_needed` only for correcting paperwork.
- Company status is `inactive` only when the inactive reason allows repair.

Operational posting/searching/booking should be blocked when:

- Company is `draft`.
- Company is `pending_review`.
- Company is `correction_needed`.
- Company is `approved_waiting_setup`.
- Company is `inactive`.
- Company is `deleted_pending_purge`.

## Audit Trail

Every important onboarding action should add an audit/history entry.

Audit events:

- Company draft created.
- Application submitted.
- File uploaded.
- Document marked verified.
- Document rejected.
- Expiration date changed.
- Correction requested.
- Paperwork approved.
- Setup email sent.
- Payment completed.
- Company activated.
- Company moved inactive.
- Company restored.
- Company soft-deleted.
- Company permanently deleted.
- User created.
- User disabled or removed.

Audit entry should include:

- Company id.
- Actor user id.
- Actor name/email.
- Action type.
- Human-readable text.
- Timestamp.
- Optional metadata such as document type, old status, new status, and reason.

## UI Design

The master onboarding console should be a new master-only workspace surface.

Preferred placement:

- Add a new `Master Onboarding` tab or route visible only to `superadmin`.

Layout:

- Header with queue counts.
- Four status tabs.
- Left list of companies in the selected tab.
- Right detail panel for selected company.
- Document cards with preview, status, expiration, source, reviewer, and action buttons.
- Action area for approve, request correction, inactive, restore, soft-delete, and permanent delete.
- Notes and audit trail below the detail panel.

Visual states:

- Green for verified/active.
- Yellow for pending/correction/setup waiting.
- Red for rejected/inactive/delete pending.
- Neutral for draft or missing optional data.

The existing signup wizard should remain the public applicant flow, but its final submitted state should clearly tell the user that the company is waiting for master approval before payment/setup.

## Backend Design

Recommended backend additions:

- Extend company schema with `onboarding`.
- Add status constants or enum-like helpers to prevent typo-based status bugs.
- Add master onboarding endpoints under the existing company module or a new onboarding module.
- Keep current file upload/preview endpoints but connect uploads to structured document verification records.
- Preserve existing subscription webhook behavior but write the canonical status `active` instead of relying only on `activated`.

Recommended API surface:

- `GET /company/onboarding/queue/:statusGroup`
- `GET /company/onboarding/:companyId`
- `PATCH /company/onboarding/:companyId/document/:documentType/verify`
- `PATCH /company/onboarding/:companyId/document/:documentType/reject`
- `PATCH /company/onboarding/:companyId/request-correction`
- `PATCH /company/onboarding/:companyId/approve-paperwork`
- `PATCH /company/onboarding/:companyId/inactivate`
- `PATCH /company/onboarding/:companyId/restore`
- `PATCH /company/onboarding/:companyId/soft-delete`
- `DELETE /company/onboarding/:companyId/purge`
- `POST /company/onboarding/:companyId/resend-setup-email`

These endpoints should require `superadmin` unless the action is explicitly allowed for `supervisor`.

## Status Compatibility

The project currently uses `pending`, `activated`, and `deactivated`. To avoid breaking existing flows, implementation should support a compatibility mapping during the transition.

Compatibility mapping:

- Existing `draft` remains `draft`.
- Existing `pending` maps to `pending_review`.
- Existing `activated` maps to `active`.
- Existing `deactivated` maps to `inactive`.
- Existing `unpaid` maps to `approved_waiting_setup` when paperwork has been approved, or remains a payment setup flag if needed during migration.

Implementation can either migrate existing database values or normalize them through helper functions before display and permission checks. The preferred long-term model is to store only the canonical statuses.

## Deletion Rules

Soft-delete should happen before permanent deletion.

Soft-delete behavior:

- Company status becomes `deleted_pending_purge`.
- Company is hidden from normal search, matching, posting, and active company lists.
- Users are blocked from login or normal workspace use.
- Uploaded files remain available to the master account for review.
- Audit trail remains visible.

Permanent delete behavior:

- Requires master account.
- Requires explicit confirmation.
- Deletes company users.
- Deletes company files.
- Deletes draft-only or onboarding-only related records.
- Preserves only a minimal master-level deletion audit if that audit store exists.

Permanent deletion should not be available directly from Active without first moving to `deleted_pending_purge`.

## Error Handling

Important error cases:

- Approve paperwork when required document is missing: block approval and show missing document.
- Approve paperwork when required document is rejected: block approval and show rejected document.
- Move to active without payment: block and show setup/payment status.
- Create users over paid seat quantity: block and show current seats and active users.
- Upload unsupported file type: reject with clear message.
- Preview unavailable: allow download and show preview error.
- Delete company with active loads: require master confirmation and show active-load warning.

## Testing Plan

Backend tests should cover:

- Draft company submit moves to `pending_review`.
- Required document rules differ for broker and carrier companies.
- Paperwork cannot be approved until required documents are verified.
- Request correction moves company to `correction_needed` and records note.
- Approve paperwork moves company to `approved_waiting_setup` and triggers email.
- Stripe activation moves approved company to `active`.
- Active users cannot exceed paid seat quantity.
- Inactive company users cannot access operational workspace.
- Soft delete blocks company users.
- Permanent delete removes company, users, and files.

Frontend tests should cover:

- Master sees correct companies in each tab.
- Document status cards render source/status/expiration/reviewer.
- Approve button is disabled or errors when requirements are missing.
- Correction form sends selected document issues and note.
- Inactive/deleted tab shows restore and permanent delete controls.
- Non-master users cannot see master onboarding navigation.

Manual smoke tests should cover:

- Complete a new company signup.
- Review and approve paperwork as superadmin.
- Receive/setup company admin email through Mailpit locally.
- Complete payment setup path with local Stripe test flow or mocked webhook.
- Create company users up to seat quantity.
- Confirm broker/carrier workspace access only after active status.

## First Implementation Slice

The first build should focus on the smallest useful end-to-end slice:

1. Add canonical status handling and onboarding verification data.
2. Add master queue API for the four tabs.
3. Add master UI for Pending paperwork with document review and approve/request correction.
4. Move approved companies into Waiting setup and send setup email.
5. Keep payment activation compatible with existing Stripe code.

This gets the core business rule working before building every inactive/delete edge case.

## Decisions Already Made

- Use the hybrid approach.
- Use local manual verification first.
- Store verification source so Highway or another provider can be added later.
- Master account is the highest permission level.
- The master console has four tabs: Pending paperwork, Waiting setup, Active, Inactive / deleted.
- Company admin can manage payment and company users.
- Regular company users can operate Prometheus only after the company is active.

## Success Criteria

This feature is successful when:

- A company can apply, upload required documents, and wait for review.
- The master account can clearly see pending companies and document status.
- The master account can approve or request corrections.
- Approved companies receive setup/payment email.
- Companies become active only after paperwork approval and payment/setup.
- Company admins can create users up to paid seat count.
- Non-approved companies cannot use posting/searching/booking features.
- Bad, expired, or abandoned companies can be moved inactive, restored, soft-deleted, or permanently deleted by the master account.
