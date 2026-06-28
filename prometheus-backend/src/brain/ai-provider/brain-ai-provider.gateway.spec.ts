import { BrainAiProviderGateway } from "./brain-ai-provider.gateway";

describe("BrainAiProviderGateway", () => {
  const settings: any = {
    getCompanySettings: jest.fn(),
    getCompanyProviderSecret: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("returns fallback when provider is disabled", async () => {
    settings.getCompanySettings.mockResolvedValue({
      ai: {
        providerMode: "disabled",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
      },
    });

    const gateway = new BrainAiProviderGateway(settings);
    const result = await gateway.generate({
      companyId: "company-1",
      taskClass: "reasoning",
      systemPrompt: "system",
      userPayload: "payload",
    });

    expect(result).toMatchObject({
      text: null,
      providerMode: "fallback",
      usedFallback: true,
    });
  });

  it("uses local runtime when local base URL is configured", async () => {
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.OPENAI_API_KEY = "lm-studio";
    settings.getCompanySettings.mockResolvedValue({
      ai: {
        providerMode: "local",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
      },
    });

    const gateway = new BrainAiProviderGateway(settings);
    jest.spyOn(gateway as any, "generateChatCompletion").mockResolvedValue("local answer");

    const result = await gateway.generate({
      companyId: "company-1",
      taskClass: "simple",
      systemPrompt: "system",
      userPayload: "payload",
    });

    expect(result).toMatchObject({
      text: "local answer",
      providerMode: "local",
      providerLabel: "Local OpenAI-compatible server",
      model: "gpt-5.4-mini",
      usedFallback: false,
    });
  });

  it("uses company OpenAI key without reading from frontend-visible settings", async () => {
    settings.getCompanySettings.mockResolvedValue({
      ai: {
        providerMode: "companyOpenAi",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
      },
    });
    settings.getCompanyProviderSecret.mockResolvedValue("sk-company-secret");

    const gateway = new BrainAiProviderGateway(settings);
    jest.spyOn(gateway as any, "generateResponsesText").mockResolvedValue("company answer");

    const result = await gateway.generate({
      companyId: "company-1",
      taskClass: "reasoning",
      systemPrompt: "system",
      userPayload: "payload",
    });

    expect(settings.getCompanyProviderSecret).toHaveBeenCalledWith("company-1");
    expect(result).toMatchObject({
      text: "company answer",
      providerMode: "companyOpenAi",
      providerLabel: "Company OpenAI",
      model: "gpt-5.5",
      usedFallback: false,
    });
  });
});
