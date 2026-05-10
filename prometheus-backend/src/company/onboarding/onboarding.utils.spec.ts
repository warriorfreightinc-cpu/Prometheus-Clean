import {
  canApproveOnboardingDocuments,
  getQueueStatuses,
  getRequiredOnboardingDocuments,
  isCompanyOperational,
  normalizeCompanyStatus
} from "./onboarding.utils";

describe("onboarding helpers", () => {
  it("maps legacy statuses to canonical statuses", () => {
    expect(normalizeCompanyStatus("pending")).toBe("pending_review");
    expect(normalizeCompanyStatus("activated")).toBe("active");
    expect(normalizeCompanyStatus("deactivated")).toBe("inactive");
    expect(normalizeCompanyStatus("draft")).toBe("draft");
    expect(normalizeCompanyStatus("approved_waiting_setup")).toBe("approved_waiting_setup");
  });

  it("groups statuses for master tabs", () => {
    expect(getQueueStatuses("pending")).toEqual(["pending_review", "correction_needed", "pending"]);
    expect(getQueueStatuses("blocked")).toEqual(["blocked"]);
    expect(getQueueStatuses("waitingSetup")).toEqual(["approved_waiting_setup", "unpaid"]);
    expect(getQueueStatuses("active")).toEqual(["active", "activated"]);
    expect(getQueueStatuses("inactive")).toEqual(["inactive", "deleted_pending_purge", "deactivated"]);
  });

  it("requires hazmat for carrier and both companies", () => {
    expect(getRequiredOnboardingDocuments("broker")).toEqual(["mc", "insurance"]);
    expect(getRequiredOnboardingDocuments("carrier")).toEqual(["mc", "insurance", "hazmat"]);
    expect(getRequiredOnboardingDocuments("both")).toEqual(["mc", "insurance", "hazmat"]);
  });

  it("only treats active and activated companies as operational", () => {
    expect(isCompanyOperational("active")).toBe(true);
    expect(isCompanyOperational("activated")).toBe(true);
    expect(isCompanyOperational("approved_waiting_setup")).toBe(false);
    expect(isCompanyOperational("pending_review")).toBe(false);
    expect(isCompanyOperational("inactive")).toBe(false);
  });

  it("allows approval only when required documents are verified", () => {
    const onboarding = {
      documents: {
        mc: { status: "verified" },
        insurance: { status: "verified" },
        hazmat: { status: "pending" }
      }
    };

    expect(canApproveOnboardingDocuments("broker", onboarding as any)).toEqual({
      ok: true,
      missing: [],
      rejected: []
    });

    expect(canApproveOnboardingDocuments("carrier", onboarding as any)).toEqual({
      ok: false,
      missing: ["hazmat"],
      rejected: []
    });
  });
});
