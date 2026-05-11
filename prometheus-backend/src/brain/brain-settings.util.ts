export type BrainMemoryMode = "off" | "companyManaged" | "prometheusManaged";

export interface BrainSettings {
  memoryMode: BrainMemoryMode;
  auditRetentionDays: number;
  allowProviderTools: boolean;
}

export const DEFAULT_BRAIN_SETTINGS: BrainSettings = {
  memoryMode: "off",
  auditRetentionDays: 365,
  allowProviderTools: false,
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
  };
}
