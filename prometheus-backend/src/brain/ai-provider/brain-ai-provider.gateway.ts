import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { BrainSettingsService } from "../brain-settings.service";
import {
  BrainAiGenerateInput,
  BrainAiGenerateResult,
  BrainAiProviderMode,
  BrainAiProviderRuntime,
  BrainAiTaskClass,
} from "./brain-ai-provider.types";
import { resolveBrainProviderMode } from "./brain-ai-provider.util";

const nodeFetch: any = require("node-fetch");

@Injectable()
export class BrainAiProviderGateway {
  constructor(private readonly settings: BrainSettingsService) {}

  async generate(input: BrainAiGenerateInput): Promise<BrainAiGenerateResult> {
    const runtime = await this.resolveRuntime(input.companyId, input.taskClass, input.preferredModel);
    if (!runtime) {
      return this.fallback("No Brain Pro provider is connected.");
    }

    try {
      const text = runtime.baseURL
        ? await this.generateChatCompletion(runtime, input.systemPrompt, input.userPayload)
        : await this.generateResponsesText(runtime, input.systemPrompt, input.userPayload);

      return {
        text,
        providerMode: runtime.mode,
        providerLabel: runtime.providerLabel,
        model: runtime.model,
        usedFallback: false,
      };
    } catch (error) {
      return this.fallback(this.sanitizeError(error));
    }
  }

  async testProvider(companyId: string) {
    const result = await this.generate({
      companyId,
      taskClass: "simple",
      systemPrompt: "Answer with exactly: Prometheus Brain Pro connected.",
      userPayload: "Connection test",
    });

    return {
      ok: Boolean(result.text && !result.usedFallback),
      providerMode: result.providerMode,
      providerLabel: result.providerLabel,
      model: result.model,
      message: result.text || result.error || "Provider is not connected.",
    };
  }

  private async resolveRuntime(
    companyId: string,
    taskClass: BrainAiTaskClass,
    preferredModel?: string
  ): Promise<BrainAiProviderRuntime | null> {
    const settings = await this.settings.getCompanySettings(companyId);
    const companyKey = await this.settings.getCompanyProviderSecret(companyId);
    const prometheusKey = process.env.OPENAI_API_KEY?.trim() || "";
    const localBaseURL = process.env.OPENAI_BASE_URL?.trim() || "";
    const mode = resolveBrainProviderMode({
      providerMode: settings.ai.providerMode,
      hasCompanyKey: Boolean(companyKey),
      hasPrometheusKey: Boolean(prometheusKey),
      hasLocalBaseUrl: Boolean(localBaseURL),
    });

    const model = preferredModel || this.modelForTask(taskClass, settings.ai);
    return this.runtimeForMode(mode, model, companyKey, prometheusKey, localBaseURL);
  }

  private runtimeForMode(
    mode: BrainAiProviderMode,
    model: string,
    companyKey: string | null,
    prometheusKey: string,
    localBaseURL: string
  ): BrainAiProviderRuntime | null {
    if (mode === "disabled") return null;
    if (mode === "companyOpenAi" && companyKey) {
      return { mode, providerLabel: "Company OpenAI", apiKey: companyKey, model };
    }
    if (mode === "prometheusManaged" && prometheusKey) {
      return { mode, providerLabel: "Prometheus-managed OpenAI", apiKey: prometheusKey, model };
    }
    if (mode === "local" && localBaseURL) {
      return {
        mode,
        providerLabel: "Local OpenAI-compatible server",
        apiKey: prometheusKey || "lm-studio",
        model: process.env.OPENAI_MODEL?.trim() || model,
        baseURL: localBaseURL,
      };
    }
    return null;
  }

  private modelForTask(taskClass: BrainAiTaskClass, ai: any): string {
    if (taskClass === "simple" || taskClass === "classification") {
      return ai.economyModel || "gpt-5.4-mini";
    }
    return ai.reasoningModel || "gpt-5.5";
  }

  private async generateResponsesText(runtime: BrainAiProviderRuntime, systemPrompt: string, userPayload: string) {
    const client = new OpenAI({
      apiKey: runtime.apiKey,
      fetch: nodeFetch,
      timeout: 30000,
    });

    const response = await client.responses.create({
      model: runtime.model as any,
      store: false,
      temperature: 0.35,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPayload }] },
      ],
      text: { verbosity: "medium" },
    });

    return response.output_text?.trim() || null;
  }

  private async generateChatCompletion(runtime: BrainAiProviderRuntime, systemPrompt: string, userPayload: string) {
    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseURL,
      fetch: nodeFetch,
      timeout: 45000,
    });

    const response = await client.chat.completions.create({
      model: runtime.model,
      temperature: 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPayload },
      ],
    });

    return response.choices?.[0]?.message?.content?.trim() || null;
  }

  private fallback(error: string): BrainAiGenerateResult {
    return {
      text: null,
      providerMode: "fallback",
      providerLabel: "Deterministic Prometheus fallback",
      model: null,
      usedFallback: true,
      error,
    };
  }

  private sanitizeError(error: any): string {
    return error?.error?.message || error?.response?.data?.error?.message || error?.message || "AI provider request failed.";
  }
}
