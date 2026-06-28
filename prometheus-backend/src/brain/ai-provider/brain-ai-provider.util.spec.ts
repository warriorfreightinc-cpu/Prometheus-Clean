import {
  maskBrainAiKey,
  normalizeBrainAiSettings,
  resolveBrainProviderMode,
} from "./brain-ai-provider.util";

describe("brain-ai-provider.util", () => {
  it("defaults to local provider mode with safe model names", () => {
    const settings = normalizeBrainAiSettings(undefined);

    expect(settings).toEqual({
      providerMode: "local",
      reasoningModel: "gpt-5.5",
      economyModel: "gpt-5.4-mini",
      monthlyBudgetUsd: 50,
      dailyRequestLimit: 500,
      providerKeyStatus: "missing",
      providerKeyFingerprint: null,
      providerLastTestedAt: null,
      providerLastError: null,
    });
  });

  it("normalizes unsupported provider mode and invalid numeric limits", () => {
    const settings = normalizeBrainAiSettings({
      providerMode: "anything",
      monthlyBudgetUsd: -25,
      dailyRequestLimit: 0,
      reasoningModel: "",
      economyModel: "mini-custom",
    });

    expect(settings.providerMode).toBe("local");
    expect(settings.monthlyBudgetUsd).toBe(50);
    expect(settings.dailyRequestLimit).toBe(500);
    expect(settings.reasoningModel).toBe("gpt-5.5");
    expect(settings.economyModel).toBe("mini-custom");
  });

  it("masks provider keys without exposing the raw secret", () => {
    expect(maskBrainAiKey("sk-proj-abcdef1234567890")).toEqual({
      status: "connected",
      fingerprint: "sk-p...7890",
    });
    expect(maskBrainAiKey("")).toEqual({
      status: "missing",
      fingerprint: null,
    });
  });

  it("resolves company OpenAI only when a company key is present", () => {
    expect(resolveBrainProviderMode({
      providerMode: "companyOpenAi",
      hasCompanyKey: false,
      hasPrometheusKey: true,
      hasLocalBaseUrl: true,
    })).toBe("local");

    expect(resolveBrainProviderMode({
      providerMode: "companyOpenAi",
      hasCompanyKey: true,
      hasPrometheusKey: false,
      hasLocalBaseUrl: false,
    })).toBe("companyOpenAi");
  });
});
