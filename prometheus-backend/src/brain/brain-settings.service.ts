import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { maskBrainAiKey, normalizeBrainAiSettings } from "./ai-provider/brain-ai-provider.util";
import { normalizeBrainSettings } from "./brain-settings.util";
import { UpdateBrainSettingsDTO } from "./dto/prometheus-brain.dto";

@Injectable()
export class BrainSettingsService {
  constructor(
    @InjectModel("Company")
    private readonly companyModel: Model<any>
  ) {}

  async getCompanySettings(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean<any>();
    return this.sanitizeSettings(company?.brainSettings);
  }

  async getCompanyProviderSecret(companyId: string): Promise<string | null> {
    const company = await this.companyModel.findById(companyId).lean<any>();
    const key = String(company?.brainSettings?.ai?.encryptedOpenAiApiKey ?? "").trim();
    return key || null;
  }

  async updateCompanySettings(companyId: string, userId: string, data: UpdateBrainSettingsDTO) {
    const existing = await this.findCompany(companyId);
    const existingAi = existing?.brainSettings?.ai ?? {};
    const incomingAi: any = data.ai ?? {};
    const keyPatch = maskBrainAiKey(incomingAi.openAiApiKey);
    const shouldReplaceKey = Object.prototype.hasOwnProperty.call(incomingAi, "openAiApiKey");

    const nextSettings = normalizeBrainSettings({
      ...(existing?.brainSettings ?? {}),
      ...data,
      ai: {
        ...existingAi,
        ...incomingAi,
        encryptedOpenAiApiKey: shouldReplaceKey
          ? String(incomingAi.openAiApiKey ?? "").trim()
          : existingAi.encryptedOpenAiApiKey,
        providerKeyStatus: shouldReplaceKey
          ? keyPatch.status
          : existingAi.providerKeyStatus,
        providerKeyFingerprint: shouldReplaceKey
          ? keyPatch.fingerprint
          : existingAi.providerKeyFingerprint,
      },
    });

    const rawKey = shouldReplaceKey
      ? String(incomingAi.openAiApiKey ?? "").trim()
      : String(existingAi.encryptedOpenAiApiKey ?? "").trim();

    const update = {
      brainSettings: {
        memoryMode: nextSettings.memoryMode,
        auditRetentionDays: nextSettings.auditRetentionDays,
        allowProviderTools: nextSettings.allowProviderTools,
        ai: {
          ...normalizeBrainAiSettings(nextSettings.ai),
          encryptedOpenAiApiKey: rawKey,
        },
        updatedBy: userId,
        updatedAt: new Date(),
      },
    };

    const updated = await this.companyModel
      .findByIdAndUpdate(companyId, update, { new: true })
      .lean<any>();

    return this.sanitizeSettings(updated?.brainSettings ?? update.brainSettings);
  }

  sanitizeSettings(value: any) {
    const settings = normalizeBrainSettings(value);
    return {
      ...settings,
      ai: {
        ...settings.ai,
        encryptedOpenAiApiKey: undefined,
      },
    };
  }

  private async findCompany(companyId: string) {
    if (typeof this.companyModel.findById !== "function") return null;
    return this.companyModel.findById(companyId).lean<any>();
  }
}
