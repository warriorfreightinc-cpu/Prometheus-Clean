import { BrainMemoryService } from "./brain-memory.service";

describe("BrainMemoryService", () => {
  const createService = (
    memoryModel: any,
    companyModel: any,
    approvals: any,
    events: any = { record: jest.fn() }
  ) => new BrainMemoryService(memoryModel, companyModel, approvals, events);

  const memoryInput = {
    companyId: "company-1",
    userId: "user-1",
    role: "carrier",
    content: "James does not like loads over 44000 lb",
    scope: "driver",
    subjectKey: "james",
    subjectLabel: "James",
    tags: ["driver-preference"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks save-memory requests when company memory is off", async () => {
    const companyModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ brainSettings: { memoryMode: "off" } }),
      }),
    };
    const approvals = {
      createRequest: jest.fn(),
    };

    const result = await createService({}, companyModel, approvals).requestSaveMemory(memoryInput);

    expect(result).toEqual({
      blocked: true,
      message: "Company memory is off. I can use this in the current conversation, but I will not save it.",
    });
    expect(approvals.createRequest).not.toHaveBeenCalled();
  });

  it("creates an approval request when company-managed memory is enabled", async () => {
    const companyModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ brainSettings: { memoryMode: "companyManaged" } }),
      }),
    };
    const approvals = {
      createRequest: jest.fn().mockResolvedValue({ _id: "approval-1", status: "pending" }),
    };

    const result = await createService({}, companyModel, approvals).requestSaveMemory(memoryInput);

    expect(result).toEqual({ _id: "approval-1", status: "pending" });
    expect(approvals.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      requestedBy: "user-1",
      actionType: "saveMemory" as const,
      payload: expect.objectContaining({
        content: "James does not like loads over 44000 lb",
        scope: "driver",
      }),
    }));
  });

  it("saves memory only from an approved memory approval payload", async () => {
    const memoryModel = {
      create: jest.fn().mockResolvedValue({ _id: "memory-1", active: true }),
    };
    const events = {
      record: jest.fn().mockResolvedValue({ _id: "event-1" }),
    };
    const approval = {
      _id: "approval-1",
      companyId: "company-1",
      requestedBy: "user-1",
      role: "carrier",
      actionType: "saveMemory" as const,
      label: "Save company memory",
      summary: "Approve saving this memory",
      riskNote: "Saved memory can influence future suggestions.",
      payload: memoryInput,
      status: "pending" as const,
    };

    const saved = await createService(memoryModel, {}, {}, events).saveApprovedMemory(approval, {
      _id: "admin-1",
      companyId: "company-1",
      role: "admin",
    });

    expect(saved).toEqual({ _id: "memory-1", active: true });
    expect(memoryModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      createdBy: "user-1",
      approvedBy: "admin-1",
      sourceApprovalId: "approval-1",
      active: true,
    }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      type: "memorySaved",
      companyId: "company-1",
    }));
  });

  it("lists only active memory for the current company", async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: "memory-1" }]);
    const sort = jest.fn().mockReturnValue({ lean });
    const memoryModel = {
      find: jest.fn().mockReturnValue({ sort }),
    };

    const memory = await createService(memoryModel, {}, {}).listForCompany("company-1");

    expect(memoryModel.find).toHaveBeenCalledWith({ companyId: "company-1", active: true });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(memory).toEqual([{ _id: "memory-1" }]);
  });
});
