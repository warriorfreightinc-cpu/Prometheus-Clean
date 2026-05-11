import { PrometheusBrainService } from "./prometheus-brain.service";

describe("PrometheusBrainService", () => {
  const user = {
    _id: "user-1",
    companyId: "company-1",
    role: "carrier",
  };

  const createService = (overrides: Partial<{
    events: any;
    approvals: any;
    memory: any;
    agentCommands: any;
  }> = {}) => {
    const events = overrides.events ?? {
      record: jest.fn().mockResolvedValue({ _id: "event-1" }),
    };
    const approvals = overrides.approvals ?? {
      createRequest: jest.fn().mockResolvedValue({ _id: "approval-1", status: "pending" }),
    };
    const memory = overrides.memory ?? {
      requestSaveMemory: jest.fn(),
    };
    const agentCommands = overrides.agentCommands ?? {
      handlePrompt: jest.fn().mockResolvedValue({
        handled: true,
        message: "I found 2 hazmat loads.",
        metadata: { commandType: "search" },
      }),
    };

    return {
      service: new PrometheusBrainService(events, approvals, memory, agentCommands),
      events,
      approvals,
      memory,
      agentCommands,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates search prompts to the existing agent command service and records events", async () => {
    const { service, events, agentCommands } = createService();

    const response: any = await service.handlePrompt({
      prompt: "do you have anything out of Memphis, TN?",
      source: "matching",
    }, user);

    expect(agentCommands.handlePrompt).toHaveBeenCalledWith(
      "do you have anything out of Memphis, TN?",
      user
    );
    expect(response).toMatchObject({
      handled: true,
      intent: "search",
      answer: "I found 2 hazmat loads.",
      metadata: { commandType: "search" },
    });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      type: "promptReceived",
      prompt: "do you have anything out of Memphis, TN?",
    }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      type: "intentClassified",
      intent: "search",
    }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      type: "suggestionShown",
      tool: "agentCommandSearch",
    }));
  });

  it("creates an approval request instead of sending email", async () => {
    const { service, approvals } = createService();

    const response: any = await service.handlePrompt({
      prompt: "email Brian my truck list and ask for anything out of CO",
      source: "matching",
    }, user);

    expect(approvals.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "sendEmail",
      companyId: "company-1",
      requestedBy: "user-1",
    }));
    expect(response.approval).toEqual({ _id: "approval-1", status: "pending" });
    expect(response.answer).toContain("Approve email draft");
  });

  it("creates an approval request instead of booking directly", async () => {
    const { service, approvals } = createService();

    const response = await service.handlePrompt({
      prompt: "book match 1",
      source: "matching",
    }, user);

    expect(approvals.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "startBookingApproval",
    }));
    expect(response.answer).toContain("Approve booking request");
  });

  it("does not save memory when company memory is off", async () => {
    const { service, memory } = createService({
      memory: {
        requestSaveMemory: jest.fn().mockResolvedValue({
          blocked: true,
          message: "Company memory is off. I can use this in the current conversation, but I will not save it.",
        }),
      },
    });

    const response = await service.handlePrompt({
      prompt: "remember James does not like loads over 44000",
      source: "matching",
    }, user);

    expect(memory.requestSaveMemory).toHaveBeenCalled();
    expect(response).toMatchObject({
      handled: true,
      intent: "saveMemory",
      answer: "Company memory is off. I can use this in the current conversation, but I will not save it.",
    });
  });

  it("answers hazmat questions with safety and verification language", async () => {
    const { service } = createService();

    const response = await service.handlePrompt({
      prompt: "can I transport 1.3 hazmat with this other product?",
      source: "matching",
    }, user);

    expect(response.intent).toBe("hazmatQuestion");
    expect(response.answer).toContain("verify");
    expect(response.answer).toContain("safety");
  });
});
