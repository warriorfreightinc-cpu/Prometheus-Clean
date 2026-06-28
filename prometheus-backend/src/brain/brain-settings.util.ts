import { BrainAiSettings } from "./ai-provider/brain-ai-provider.types";
import { normalizeBrainAiSettings } from "./ai-provider/brain-ai-provider.util";

export type BrainMemoryMode = "off" | "companyManaged" | "prometheusManaged";

export interface BrainSettings {
  memoryMode: BrainMemoryMode;
  auditRetentionDays: number;
  allowProviderTools: boolean;
  ai: BrainAiSettings;
}

export const DEFAULT_BRAIN_SETTINGS: BrainSettings = {
  memoryMode: "off",
  auditRetentionDays: 365,
  allowProviderTools: false,
  ai: normalizeBrainAiSettings(undefined),
};

export function normalizeBrainSettings(value: any): BrainSettings {
  const memoryMode = ["off", "companyManaged", "prometheusManaged"].includes(
    value?.memoryMode
  )
    ? value.memoryMode
    : DEFAULT_BRAIN_SETTINGS.memoryMode;

  return {
    memoryMode,
    auditRetentionDays: Number.isFinite(Number(value?.auditRetentionDays))
      ? Number(value.auditRetentionDays)
      : DEFAULT_BRAIN_SETTINGS.auditRetentionDays,
    allowProviderTools: Boolean(value?.allowProviderTools),
    ai: normalizeBrainAiSettings(value?.ai ?? value),
  };
}
