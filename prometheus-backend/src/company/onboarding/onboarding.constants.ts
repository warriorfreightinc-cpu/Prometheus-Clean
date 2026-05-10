export const COMPANY_ONBOARDING_STATUSES = {
  Draft: "draft",
  Blocked: "blocked",
  PendingReview: "pending_review",
  CorrectionNeeded: "correction_needed",
  ApprovedWaitingSetup: "approved_waiting_setup",
  Active: "active",
  Inactive: "inactive",
  DeletedPendingPurge: "deleted_pending_purge",
  Purged: "purged"
} as const;

export type CompanyOnboardingStatus =
  typeof COMPANY_ONBOARDING_STATUSES[keyof typeof COMPANY_ONBOARDING_STATUSES];

export const LEGACY_COMPANY_STATUS_MAP: Record<string, CompanyOnboardingStatus> = {
  draft: COMPANY_ONBOARDING_STATUSES.Draft,
  pending: COMPANY_ONBOARDING_STATUSES.PendingReview,
  unpaid: COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
  activated: COMPANY_ONBOARDING_STATUSES.Active,
  deactivated: COMPANY_ONBOARDING_STATUSES.Inactive
};

export const ONBOARDING_DOCUMENT_TYPES = {
  Mc: "mc",
  Insurance: "insurance",
  Hazmat: "hazmat"
} as const;

export type OnboardingDocumentType =
  typeof ONBOARDING_DOCUMENT_TYPES[keyof typeof ONBOARDING_DOCUMENT_TYPES];

export const ONBOARDING_DOCUMENT_STATUS = {
  Missing: "missing",
  Pending: "pending",
  Verified: "verified",
  Rejected: "rejected",
  Expired: "expired"
} as const;

export type OnboardingDocumentStatus =
  typeof ONBOARDING_DOCUMENT_STATUS[keyof typeof ONBOARDING_DOCUMENT_STATUS];

export const VERIFICATION_SOURCES = {
  Manual: "manual",
  Highway: "highway",
  MyCarrierPacket: "mycarrierpacket",
  Truckstop: "truckstop",
  Other: "other"
} as const;

export type VerificationSource =
  typeof VERIFICATION_SOURCES[keyof typeof VERIFICATION_SOURCES];

export type OnboardingQueueGroup = "pending" | "blocked" | "waitingSetup" | "active" | "inactive";
