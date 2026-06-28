export type BrainAiProviderMode =
  | "prometheusManaged"
  | "companyOpenAi"
  | "local"
  | "disabled";

export type BrainAiProviderKeyStatus =
  | "missing"
  | "connected"
  | "failed"
  | "rotating";

export type BrainAiTaskClass =
  | "simple"
  | "classification"
  | "reasoning"
  | "drafting"
  | "fallback";

export interface BrainAiSettings {
  providerMode: BrainAiProviderMode;
  reasoningModel: string;
  economyModel: string;
  monthlyBudgetUsd: number;
  dailyRequestLimit: number;
  providerKeyStatus: BrainAiProviderKeyStatus;
  providerKeyFingerprint: string | null;
  providerLastTestedAt: Date | string | null;
  providerLastError: string | null;
}

export interface BrainAiProviderResolutionInput {
  providerMode: BrainAiProviderMode;
  hasCompanyKey: boolean;
  hasPrometheusKey: boolean;
  hasLocalBaseUrl: boolean;
}

export interface BrainAiProviderRuntime {
  mode: BrainAiProviderMode;
  providerLabel: string;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface BrainAiGenerateInput {
  companyId: string;
  taskClass: BrainAiTaskClass;
  systemPrompt: string;
  userPayload: string;
  preferredModel?: string;
}

export interface BrainAiGenerateResult {
  text: string | null;
  providerMode: BrainAiProviderMode | "fallback";
  providerLabel: string;
  model: string | null;
  usedFallback: boolean;
  error?: string;
}
