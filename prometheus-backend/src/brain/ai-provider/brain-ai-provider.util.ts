import {
  BrainAiProviderMode,
  BrainAiProviderResolutionInput,
  BrainAiSettings,
} from "./brain-ai-provider.types";

export const DEFAULT_BRAIN_AI_SETTINGS: BrainAiSettings = {
  providerMode: "local",
  reasoningModel: "gpt-5.5",
  economyModel: "gpt-5.4-mini",
  monthlyBudgetUsd: 50,
  dailyRequestLimit: 500,
  providerKeyStatus: "missing",
  providerKeyFingerprint: null,
  providerLastTestedAt: null,
  providerLastError: null,
};

const PROVIDER_MODES: BrainAiProviderMode[] = [
  "prometheusManaged",
  "companyOpenAi",
  "local",
  "disabled",
];

const PROVIDER_KEY_STATUSES = [
  "missing",
  "connected",
  "failed",
  "rotating",
];

export function normalizeBrainAiSettings(value: any): BrainAiSettings {
  const providerMode = PROVIDER_MODES.includes(value?.providerMode)
    ? value.providerMode
    : DEFAULT_BRAIN_AI_SETTINGS.providerMode;
  const monthlyBudgetUsd = Number(value?.monthlyBudgetUsd);
  const dailyRequestLimit = Number(value?.dailyRequestLimit);

  return {
    providerMode,
    reasoningModel: cleanModelName(value?.reasoningModel, DEFAULT_BRAIN_AI_SETTINGS.reasoningModel),
    economyModel: cleanModelName(value?.economyModel, DEFAULT_BRAIN_AI_SETTINGS.economyModel),
    monthlyBudgetUsd: monthlyBudgetUsd > 0 ? monthlyBudgetUsd : DEFAULT_BRAIN_AI_SETTINGS.monthlyBudgetUsd,
    dailyRequestLimit: dailyRequestLimit > 0
      ? Math.floor(dailyRequestLimit)
      : DEFAULT_BRAIN_AI_SETTINGS.dailyRequestLimit,
    providerKeyStatus: PROVIDER_KEY_STATUSES.includes(value?.providerKeyStatus)
      ? value.providerKeyStatus
      : DEFAULT_BRAIN_AI_SETTINGS.providerKeyStatus,
    providerKeyFingerprint: optionalString(value?.providerKeyFingerprint),
    providerLastTestedAt: value?.providerLastTestedAt ?? null,
    providerLastError: optionalString(value?.providerLastError),
  };
}

export function maskBrainAiKey(rawKey: string | undefined | null) {
  const key = String(rawKey ?? "").trim();
  if (!key) {
    return { status: "missing" as const, fingerprint: null };
  }
  const start = key.slice(0, 4);
  const end = key.slice(-4);
  return { status: "connected" as const, fingerprint: `${start}...${end}` };
}

export function resolveBrainProviderMode(input: BrainAiProviderResolutionInput): BrainAiProviderMode {
  if (input.providerMode === "disabled") return "disabled";
  if (input.providerMode === "companyOpenAi" && input.hasCompanyKey) return "companyOpenAi";
  if (input.providerMode === "prometheusManaged" && input.hasPrometheusKey) return "prometheusManaged";
  if (input.hasLocalBaseUrl) return "local";
  if (input.hasPrometheusKey) return "prometheusManaged";
  return "disabled";
}

function cleanModelName(value: unknown, fallback: string): string {
  const model = String(value ?? "").trim();
  return model || fallback;
}

function optionalString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}
