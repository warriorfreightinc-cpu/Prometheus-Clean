import { BrainSettingsService } from "./brain-settings.service";

describe("BrainSettingsService", () => {
  const createService = (companyModel: any) => new BrainSettingsService(companyModel);

  it("returns normalized settings with no raw provider key", async () => {
    const companyModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          brainSettings: {
            memoryMode: "companyManaged",
            ai: {
              providerMode: "companyOpenAi",
              encryptedOpenAiApiKey: "SECRET",
              providerKeyStatus: "connected",
              providerKeyFingerprint: "sk-p...1234",
            },
          },
        }),
      }),
    };

    const settings = await createService(companyModel).getCompanySettings("company-1");

    expect(settings.memoryMode).toBe("companyManaged");
    expect(settings.ai.providerMode).toBe("companyOpenAi");
    expect(settings.ai.providerKeyFingerprint).toBe("sk-p...1234");
    expect(JSON.stringify(settings)).not.toContain("SECRET");
  });

  it("stores company key metadata and raw key server-side only", async () => {
    const lean = jest.fn().mockResolvedValue({ _id: "company-1" });
    const companyModel = {
      findByIdAndUpdate: jest.fn().mockReturnValue({ lean }),
    };

    await createService(companyModel).updateCompanySettings("company-1", "admin-1", {
      memoryMode: "companyManaged",
      auditRetentionDays: 90,
      allowProviderTools: true,
      ai: {
        providerMode: "companyOpenAi",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
        monthlyBudgetUsd: 100,
        dailyRequestLimit: 250,
        openAiApiKey: "sk-proj-abcdef1234567890",
      },
    });

    expect(companyModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        brainSettings: expect.objectContaining({
          memoryMode: "companyManaged",
          ai: expect.objectContaining({
            providerMode: "companyOpenAi",
            encryptedOpenAiApiKey: "sk-proj-abcdef1234567890",
            providerKeyStatus: "connected",
            providerKeyFingerprint: "sk-p...7890",
          }),
        }),
      }),
      { new: true }
    );
  });

  it("preserves existing provider key when update omits openAiApiKey", async () => {
    const companyModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          brainSettings: {
            ai: {
              encryptedOpenAiApiKey: "existing-secret",
              providerKeyStatus: "connected",
              providerKeyFingerprint: "sk-p...0001",
            },
          },
        }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "company-1" }),
      }),
    };

    await createService(companyModel).updateCompanySettings("company-1", "admin-1", {
      ai: { providerMode: "companyOpenAi" },
    });

    expect(companyModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        brainSettings: expect.objectContaining({
          ai: expect.objectContaining({
            encryptedOpenAiApiKey: "existing-secret",
            providerKeyStatus: "connected",
            providerKeyFingerprint: "sk-p...0001",
          }),
        }),
      }),
      { new: true }
    );
  });
});
