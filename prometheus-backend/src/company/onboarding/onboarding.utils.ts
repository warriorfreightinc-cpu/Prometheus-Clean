import {
  COMPANY_ONBOARDING_STATUSES,
  CompanyOnboardingStatus,
  LEGACY_COMPANY_STATUS_MAP,
  ONBOARDING_DOCUMENT_STATUS,
  OnboardingDocumentType,
  OnboardingQueueGroup
} from "./onboarding.constants";

export function normalizeCompanyStatus(status?: string | null): CompanyOnboardingStatus {
  const normalized = String(status ?? "").trim();
  if (normalized in LEGACY_COMPANY_STATUS_MAP) {
    return LEGACY_COMPANY_STATUS_MAP[normalized];
  }

  const canonical = Object.values(COMPANY_ONBOARDING_STATUSES).find((value) => value === normalized);
  return canonical ?? COMPANY_ONBOARDING_STATUSES.Draft;
}

export function getQueueStatuses(group: OnboardingQueueGroup): string[] {
  if (group === "pending") {
    return [
      COMPANY_ONBOARDING_STATUSES.PendingReview,
      COMPANY_ONBOARDING_STATUSES.CorrectionNeeded,
      "pending"
    ];
  }

  if (group === "blocked") {
    return [
      COMPANY_ONBOARDING_STATUSES.Blocked
    ];
  }

  if (group === "waitingSetup") {
    return [
      COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
      "unpaid"
    ];
  }

  if (group === "active") {
    return [
      COMPANY_ONBOARDING_STATUSES.Active,
      "activated"
    ];
  }

  return [
    COMPANY_ONBOARDING_STATUSES.Inactive,
    COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge,
    "deactivated"
  ];
}

export function getRequiredOnboardingDocuments(companyType?: string): OnboardingDocumentType[] {
  const type = String(companyType ?? "").toLowerCase();
  if (type === "carrier" || type === "both") {
    return ["mc", "insurance", "hazmat"];
  }
  return ["mc", "insurance"];
}

export function isCompanyOperational(status?: string | null): boolean {
  return normalizeCompanyStatus(status) === COMPANY_ONBOARDING_STATUSES.Active;
}

export function isCompanyInSetup(status?: string | null): boolean {
  return normalizeCompanyStatus(status) === COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup;
}

export function isCompanySoftDeleted(status?: string | null): boolean {
  return normalizeCompanyStatus(status) === COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge;
}

export function canApproveOnboardingDocuments(
  companyType: string,
  onboarding: { documents?: Record<string, { status?: string }> } | null | undefined
): { ok: boolean; missing: OnboardingDocumentType[]; rejected: OnboardingDocumentType[] } {
  const documents = onboarding?.documents ?? {};
  const required = getRequiredOnboardingDocuments(companyType);
  const missing: OnboardingDocumentType[] = [];
  const rejected: OnboardingDocumentType[] = [];

  required.forEach((documentType) => {
    const status = documents[documentType]?.status;
    if (status === ONBOARDING_DOCUMENT_STATUS.Rejected) {
      rejected.push(documentType);
      return;
    }

    if (status !== ONBOARDING_DOCUMENT_STATUS.Verified) {
      missing.push(documentType);
    }
  });

  return {
    ok: missing.length === 0 && rejected.length === 0,
    missing,
    rejected
  };
}
