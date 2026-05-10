import * as nodemailer from "nodemailer";
import { OnboardingService } from "./onboarding.service";

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({})
  }))
}));

describe("OnboardingService", () => {
  const companyModel: any = {
    find: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn()
  };
  const userModel: any = {
    deleteMany: jest.fn(),
    updateMany: jest.fn()
  };
  const historyModel: any = {
    findOneAndUpdate: jest.fn(),
    create: jest.fn()
  };
  const configService: any = {
    get: jest.fn((key: string) => {
      const values = {
        PROJECT_NAME: "Prometheus",
        APP_URL: "http://localhost:4300",
        MAIL_HOST: "localhost",
        MAIL_PORT: "1025",
        MAIL_PORT_SECURE: "0",
        MAIL_USER: "prometheus@local.test",
        MAIL_PASSWORD: ""
      };
      return values[key];
    })
  };

  function createService() {
    return new OnboardingService(companyModel, userModel, historyModel, configService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads companies by queue group", async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: "company-1", status: "pending_review" }]);
    const sort = jest.fn(() => ({ lean }));
    companyModel.find.mockReturnValue({ sort });

    const result = await createService().getQueue("pending");

    expect(companyModel.find).toHaveBeenCalledWith({
      status: { $in: ["pending_review", "correction_needed", "pending"] },
      deletedAt: { $exists: false }
    });
    expect(sort).toHaveBeenCalledWith({ isWaiting: -1, createdAt: -1 });
    expect(result).toEqual([{ _id: "company-1", status: "pending_review" }]);
  });

  it("keeps soft-deleted companies visible in the inactive queue", async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: "company-2", status: "deleted_pending_purge" }]);
    const sort = jest.fn(() => ({ lean }));
    companyModel.find.mockReturnValue({ sort });

    await createService().getQueue("inactive");

    expect(companyModel.find).toHaveBeenCalledWith({
      status: { $in: ["inactive", "deleted_pending_purge", "deactivated"] }
    });
  });

  it("loads blocked signup records in the blocked queue", async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: "company-3", status: "blocked" }]);
    const sort = jest.fn(() => ({ lean }));
    companyModel.find.mockReturnValue({ sort });

    await createService().getQueue("blocked" as any);

    expect(companyModel.find).toHaveBeenCalledWith({
      status: { $in: ["blocked"] },
      deletedAt: { $exists: false }
    });
  });

  it("loads a single onboarding detail", async () => {
    const lean = jest.fn().mockResolvedValue({ _id: "company-1", status: "pending_review" });
    companyModel.findById.mockReturnValue({ lean });

    const result = await createService().getDetail("company-1");

    expect(companyModel.findById).toHaveBeenCalledWith("company-1");
    expect(result).toEqual({ _id: "company-1", status: "pending_review" });
  });

  it("marks an onboarding document verified", async () => {
    companyModel.findOneAndUpdate.mockResolvedValue({
      _id: "company-1",
      onboarding: { documents: { mc: { status: "verified" } } }
    });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    const result = await createService().verifyDocument(
      "company-1",
      "mc",
      { expirationDate: "2027-04-28", notes: "Matched FMCSA record.", source: "manual" },
      { _id: "master-1", email: "master@prometheus.test", firstName: "Master", lastName: "User" }
    );

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "onboarding.documents.mc.status": "verified",
          "onboarding.documents.mc.source": "manual",
          "onboarding.documents.mc.expirationDate": new Date("2027-04-28")
        })
      }),
      { new: true }
    );
    expect(result.onboarding.documents.mc.status).toBe("verified");
  });

  it("marks an onboarding document rejected", async () => {
    companyModel.findOneAndUpdate.mockResolvedValue({
      _id: "company-1",
      onboarding: { documents: { insurance: { status: "rejected" } } }
    });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    await createService().rejectDocument(
      "company-1",
      "insurance",
      { reason: "Insured name does not match company.", notes: "Ask for corrected COI." },
      { _id: "master-1", email: "master@prometheus.test", firstName: "Master", lastName: "User" }
    );

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "onboarding.documents.insurance.status": "rejected",
          "onboarding.documents.insurance.rejectionReason": "Insured name does not match company."
        })
      }),
      { new: true }
    );
  });

  it("approves paperwork when required documents are verified", async () => {
    companyModel.findById.mockResolvedValue({
      _id: "company-1",
      name: "Lakefront Carrier",
      email: "ops@lakefront.test",
      type: "broker",
      contactPerson: { email: "owner@lakefront.test" },
      onboarding: {
        documents: {
          mc: { status: "verified" },
          insurance: { status: "verified" }
        }
      }
    });
    companyModel.findOneAndUpdate.mockResolvedValue({ _id: "company-1", status: "approved_waiting_setup" });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    const result = await createService().approvePaperwork("company-1", {
      _id: "master-1",
      email: "master@prometheus.test",
      firstName: "Master",
      lastName: "User"
    });

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "approved_waiting_setup",
          "onboarding.status": "approved_waiting_setup",
          "onboarding.approvedBy": "master-1"
        })
      }),
      { new: true }
    );
    expect(result.status).toBe("approved_waiting_setup");
    expect(nodemailer.createTransport).toHaveBeenCalled();
  });

  it("blocks paperwork approval when required documents are missing", async () => {
    companyModel.findById.mockResolvedValue({
      _id: "company-1",
      type: "carrier",
      onboarding: {
        documents: {
          mc: { status: "verified" },
          insurance: { status: "verified" }
        }
      }
    });

    await expect(createService().approvePaperwork("company-1", { _id: "master-1" }))
      .rejects
      .toThrow("Cannot approve company. Missing or unverified documents: hazmat.");
  });

  it("requests correction and moves company to correction_needed", async () => {
    companyModel.findOneAndUpdate.mockResolvedValue({ _id: "company-1", status: "correction_needed" });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    await createService().requestCorrection(
      "company-1",
      { message: "Please upload a corrected insurance certificate." },
      { _id: "master-1", email: "master@prometheus.test", firstName: "Master", lastName: "User" }
    );

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "correction_needed",
          "onboarding.status": "correction_needed",
          "onboarding.correctionRequestedBy": "master-1"
        })
      }),
      { new: true }
    );
  });

  it("unlocks a blocked signup back to draft with an override audit trail", async () => {
    const lean = jest.fn().mockResolvedValue({ _id: "company-4", status: "blocked" });
    companyModel.findById.mockReturnValue({ lean });
    companyModel.findOneAndUpdate.mockResolvedValue({
      _id: "company-4",
      status: "draft",
      onboarding: { status: "draft", verificationOverride: true }
    });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    await createService().restoreCompany(
      "company-4",
      { status: "draft", reason: "Authority block released." },
      { _id: "master-1", email: "master@prometheus.test" }
    );

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-4" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "draft",
          "onboarding.status": "draft",
          "onboarding.unblockedBy": "master-1",
          "onboarding.verificationOverride": true
        })
      }),
      { new: true }
    );
  });
});
