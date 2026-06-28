import { PrometheusBrainController } from "./prometheus-brain.controller";

describe("PrometheusBrainController", () => {
  const req = {
    user: {
      _id: "user-1",
      companyId: "company-1",
      role: "carrier",
    },
  };

  const createController = () => {
    const brain = {
      handlePrompt: jest.fn().mockResolvedValue({ answer: "ok" }),
    };
    const events = {
      listForCompany: jest.fn().mockResolvedValue([]),
    };
    const approvals = {
      listForCompany: jest.fn().mockResolvedValue([]),
      approve: jest.fn().mockResolvedValue({ status: "approved" }),
      reject: jest.fn().mockResolvedValue({ status: "rejected" }),
    };
    const memory = {
      listForCompany: jest.fn().mockResolvedValue([]),
      updateCompanySettings: jest.fn().mockResolvedValue({ brainSettings: { memoryMode: "off" } }),
    };
    const settings = {
      getCompanySettings: jest.fn().mockResolvedValue({ memoryMode: "off" }),
      updateCompanySettings: jest.fn().mockResolvedValue({ memoryMode: "companyManaged" }),
    };
    const aiProvider = {
      testProvider: jest.fn().mockResolvedValue({
        ok: true,
        providerMode: "local",
        providerLabel: "Local OpenAI-compatible server",
        model: "gpt-5.4-mini",
        message: "Prometheus Brain Pro connected.",
      }),
    };

    return {
      controller: new PrometheusBrainController(
        brain as any,
        events as any,
        approvals as any,
        memory as any,
        settings as any,
        aiProvider as any
      ),
      brain,
      events,
      approvals,
      memory,
      settings,
      aiProvider,
    };
  };

  it("passes prompt payload and current user to the Brain service", async () => {
    const { controller, brain } = createController();
    const payload = { prompt: "anything out of Memphis?", source: "matching" as const };

    await controller.prompt(payload, req);

    expect(brain.handlePrompt).toHaveBeenCalledWith(payload, req.user);
  });

  it("lists events for the current company", async () => {
    const { controller, events } = createController();

    await controller.listEvents(req);

    expect(events.listForCompany).toHaveBeenCalledWith("company-1");
  });

  it("approves and rejects approval requests with the current user", async () => {
    const { controller, approvals } = createController();

    await controller.approve("approval-1", req);
    await controller.reject("approval-1", req);

    expect(approvals.approve).toHaveBeenCalledWith("approval-1", req.user);
    expect(approvals.reject).toHaveBeenCalledWith("approval-1", req.user);
  });

  it("updates company Brain settings with the current company and user", async () => {
    const { controller, settings } = createController();
    const payload = { memoryMode: "companyManaged" as const };

    await controller.updateSettings(payload, req);

    expect(settings.updateCompanySettings).toHaveBeenCalledWith("company-1", "user-1", payload);
  });

  it("returns sanitized Brain settings for the current company", async () => {
    const { controller, settings } = createController();

    await controller.getSettings(req);

    expect(settings.getCompanySettings).toHaveBeenCalledWith("company-1");
  });

  it("tests the Brain Pro provider for the current company", async () => {
    const { controller, aiProvider } = createController();

    await controller.testProvider(req);

    expect(aiProvider.testProvider).toHaveBeenCalledWith("company-1");
  });
});
