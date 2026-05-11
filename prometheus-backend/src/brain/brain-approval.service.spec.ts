import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { BrainApprovalService } from "./brain-approval.service";

describe("BrainApprovalService", () => {
  const user = {
    _id: "user-1",
    companyId: "company-1",
    role: "carrier",
  };

  const createService = (approvalModel: any, events: any) =>
    new BrainApprovalService(approvalModel, events);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a pending approval request and records an audit event", async () => {
    const approvalModel = {
      create: jest.fn().mockResolvedValue({ _id: "approval-1", status: "pending" }),
    };
    const events = {
      record: jest.fn().mockResolvedValue({ _id: "event-1" }),
    };

    const approval = await createService(approvalModel, events).createRequest({
      companyId: "company-1",
      requestedBy: "user-1",
      role: "carrier",
      actionType: "sendEmail",
      label: "Approve email draft",
      summary: "Send this email?",
      riskNote: "Email creates a written business record.",
      payload: { to: "broker@example.com" },
    });

    expect(approval).toEqual({ _id: "approval-1", status: "pending" });
    expect(approvalModel.create).toHaveBeenCalledWith({
      companyId: "company-1",
      requestedBy: "user-1",
      role: "carrier",
      actionType: "sendEmail",
      label: "Approve email draft",
      summary: "Send this email?",
      riskNote: "Email creates a written business record.",
      payload: { to: "broker@example.com" },
      status: "pending",
    });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      userId: "user-1",
      type: "approvalRequested",
      intent: "sendEmail",
    }));
  });

  it("rejects a pending company approval and records the rejection", async () => {
    const approval = {
      _id: "approval-1",
      companyId: "company-1",
      actionType: "sendChat",
      status: "pending",
      summary: "Ask broker about setup",
      payload: { body: "Can you send setup?" },
    };
    const approvalModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(approval),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...approval, status: "rejected" }),
      }),
    };
    const events = {
      record: jest.fn().mockResolvedValue({ _id: "event-1" }),
    };

    const rejected = await createService(approvalModel, events).reject("approval-1", user);

    expect(approvalModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "approval-1",
      expect.objectContaining({
        status: "rejected",
        decidedBy: "user-1",
      }),
      { new: true }
    );
    expect(rejected.status).toBe("rejected");
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      type: "approvalRejected",
      intent: "sendChat",
    }));
  });

  it("blocks access to approvals from another company", async () => {
    const approvalModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: "approval-1",
          companyId: "company-2",
          status: "pending",
        }),
      }),
    };

    await expect(
      createService(approvalModel, { record: jest.fn() }).reject("approval-1", user)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("does not reject an approval that is no longer pending", async () => {
    const approvalModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: "approval-1",
          companyId: "company-1",
          status: "approved",
        }),
      }),
    };

    await expect(
      createService(approvalModel, { record: jest.fn() }).reject("approval-1", user)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
