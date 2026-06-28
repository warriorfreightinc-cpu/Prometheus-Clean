import { BadRequestException, Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { AgentCommandService } from "../matching/agent-command.service";
import { RoutingIntelligenceRequestDTO } from "../routing/dto/routing-intelligence.dto";
import { RoutingIntelligenceService } from "../routing/routing-intelligence.service";
import { BrainApprovalService } from "./brain-approval.service";
import { BrainEventService } from "./brain-event.service";
import { BrainMemoryService } from "./brain-memory.service";
import { PrometheusBrainPromptDTO } from "./dto/prometheus-brain.dto";
import { PrometheusBrainActionType } from "./interface/prometheus-brain-approval.interface";
import { PrometheusBrainSource } from "./interface/prometheus-brain-event.interface";
import {
  parsePrometheusBrainPrompt,
  PrometheusBrainIntent,
} from "./prometheus-brain-parser";

const nodeFetch: any = require("node-fetch");

type BrainAiRuntimeConfig = {
  mode: "openai" | "local";
  providerLabel: string;
  apiKey: string;
  model: string;
  baseURL?: string;
};

@Injectable()
export class PrometheusBrainService {
  constructor(
    private readonly events: BrainEventService,
    private readonly approvals: BrainApprovalService,
    private readonly memory: BrainMemoryService,
    private readonly agentCommands: AgentCommandService,
    private readonly routingIntelligence: RoutingIntelligenceService
  ) {}

  async handlePrompt(data: PrometheusBrainPromptDTO, user: any) {
    const companyId = String(data?.related?.companyId ?? user?.companyId ?? "");
    const userId = String(user?._id ?? "");
    const role = String(user?.role ?? "");
    const source = data?.source || "matching";
    const prompt = String(data?.prompt ?? "").trim();

    if (!prompt) {
      throw new BadRequestException("Prompt is required.");
    }

    await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "promptReceived",
      prompt,
      related: data.related,
    });

    const parsed = parsePrometheusBrainPrompt(prompt);
    await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "intentClassified",
      prompt,
      intent: parsed.intent,
    });

    if (parsed.intent === "search") {
      return this.handleSearchIntent(prompt, source, data, user, companyId, userId, role, parsed.intent);
    }

    if (parsed.intent === "map") {
      return this.handleMapIntent(prompt, source, data, companyId, userId, role);
    }

    if (parsed.intent === "draftEmail") {
      return this.createDraftApproval({
        user,
        companyId,
        source,
        prompt,
        related: data.related,
        actionType: "sendEmail",
        label: "Approve email draft",
        summary: `Prometheus drafted an email from your request: ${prompt}`,
        riskNote:
          "Email is not sent until a human approves and an email provider is connected.",
      });
    }

    if (parsed.intent === "draftChat") {
      return this.createDraftApproval({
        user,
        companyId,
        source,
        prompt,
        related: data.related,
        actionType: "sendChat",
        label: "Approve chat message",
        summary: `Prometheus drafted a chat message from your request: ${prompt}`,
        riskNote: "Chat is not sent until a human approves it.",
      });
    }

    if (parsed.intent === "bookingApproval") {
      return this.createDraftApproval({
        user,
        companyId,
        source,
        prompt,
        related: data.related,
        actionType: "startBookingApproval",
        label: "Approve booking request",
        summary:
          "Prometheus can start the booking approval conversation for both sides.",
        riskNote:
          "Both broker and carrier still need to approve before the load moves to booking chat.",
      });
    }

    if (parsed.intent === "saveMemory") {
      const request = await this.memory.requestSaveMemory({
        companyId,
        userId,
        role,
        content: prompt,
        scope: "company",
        subjectKey: companyId,
        subjectLabel: "Company preference",
        tags: ["user-requested"],
      });

      if (request?.blocked) {
        return {
          handled: true,
          intent: parsed.intent,
          answer: request.message,
        };
      }

      return {
        handled: true,
        intent: parsed.intent,
        answer:
          "I prepared this memory for approval. I will not save it until an authorized user approves it.",
        approval: request,
      };
    }

    if (parsed.intent === "hazmatQuestion") {
      const answer = this.renderKnowledgeAnswer(parsed.intent, prompt);
      const event = await this.events.record({
        companyId,
        userId,
        role,
        source,
        type: "suggestionShown",
        prompt,
        intent: parsed.intent,
        tool: "deterministicHazmatSafetyAnswer",
        message: answer,
      });

      return {
        handled: true,
        intent: parsed.intent,
        answer,
        eventId: String(event?._id ?? ""),
      };
    }

    const aiAnswer = await this.tryGenerateBrainAnswer(parsed.intent, prompt, {
      role,
      source,
      related: data.related,
    });
    const answer = aiAnswer ?? this.renderKnowledgeAnswer(parsed.intent, prompt);
    const event = await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "suggestionShown",
      prompt,
      intent: parsed.intent,
      tool: aiAnswer ? "transportationAiRuntime" : "deterministicTransportationAnswer",
      message: answer,
    });

    return {
      handled: true,
      intent: parsed.intent,
      answer,
      eventId: String(event?._id ?? ""),
    };
  }

  private getAiRuntimeConfig(): BrainAiRuntimeConfig | null {
    if (process.env.NODE_ENV === "test") {
      return null;
    }

    const baseURL = process.env.OPENAI_BASE_URL?.trim();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const configuredModel = process.env.OPENAI_MODEL?.trim();

    if (baseURL) {
      return {
        mode: "local",
        providerLabel: "Local OpenAI-compatible server",
        apiKey: apiKey || "lm-studio",
        model: configuredModel || "prometheus-local",
        baseURL,
      };
    }

    if (apiKey) {
      return {
        mode: "openai",
        providerLabel: "OpenAI",
        apiKey,
        model: configuredModel || "gpt-5.4-mini",
      };
    }

    return null;
  }

  private async tryGenerateBrainAnswer(
    intent: PrometheusBrainIntent,
    prompt: string,
    context: { role: string; source: PrometheusBrainSource; related?: Record<string, string> }
  ): Promise<string | null> {
    const runtime = this.getAiRuntimeConfig();
    if (!runtime) {
      return null;
    }

    try {
      return runtime.mode === "local"
        ? await this.generateLocalBrainAnswer(runtime, intent, prompt, context)
        : await this.generateOpenAiBrainAnswer(runtime, intent, prompt, context);
    } catch {
      return null;
    }
  }

  private buildBrainSystemPrompt() {
    return [
      "You are Prometheus, a hazmat transportation assistant for U.S. brokers, carriers, dispatchers, and company admins.",
      "Sound warm, direct, and human, like an assistant sitting beside the dispatcher during a busy operations day.",
      "Never sound like a terminal, script, or generic chatbot.",
      "Help with hazmat matching, equipment fit, pickup timing, route context, rate thinking, driver risk, written-trail decisions, and next-step suggestions.",
      "Acknowledge what the user is trying to do before giving steps, especially when they sound frustrated or casual.",
      "Ask one practical follow-up question when a request is missing lane, equipment, timing, contact, or approval details.",
      "Do not execute booking, email, chat, setup, tracking, dispatch, or compliance actions without human approval.",
      "Do not invent live loads, trucks, tracking, ELD status, broker availability, rates, FMCSA facts, or legal conclusions.",
      "If the user asks for live board data that is not in context, say what Prometheus can check and what details you need.",
      "For hazmat compliance questions, give practical review points and tell the user to verify against current DOT, PHMSA, company policy, and shipment paperwork.",
      "Keep answers concise and useful for an active operations desk.",
    ].join(" ");
  }

  private buildBrainUserPayload(intent: PrometheusBrainIntent, prompt: string, context: Record<string, unknown>) {
    return JSON.stringify({
      intent,
      prompt,
      context,
      guardrails: [
        "Human approves every external action.",
        "Use Prometheus tools for live search and booking state.",
        "Never claim a live match exists unless it is supplied by the system context.",
      ],
    });
  }

  private async generateLocalBrainAnswer(
    runtime: BrainAiRuntimeConfig,
    intent: PrometheusBrainIntent,
    prompt: string,
    context: Record<string, unknown>
  ) {
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
        { role: "system", content: this.buildBrainSystemPrompt() },
        { role: "user", content: this.buildBrainUserPayload(intent, prompt, context) },
      ],
    });

    return response.choices?.[0]?.message?.content?.trim() || null;
  }

  private async generateOpenAiBrainAnswer(
    runtime: BrainAiRuntimeConfig,
    intent: PrometheusBrainIntent,
    prompt: string,
    context: Record<string, unknown>
  ) {
    const client = new OpenAI({
      apiKey: runtime.apiKey,
      fetch: nodeFetch,
      timeout: 30000,
    });

    const response = await client.responses.create({
      model: runtime.model,
      store: false,
      temperature: 0.35,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: this.buildBrainSystemPrompt() }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: this.buildBrainUserPayload(intent, prompt, context) }],
        },
      ],
      text: { verbosity: "medium" },
    });

    return response.output_text?.trim() || this.extractResponseOutputText(response)?.trim() || null;
  }

  private extractResponseOutputText(response: any) {
    for (const item of response?.output ?? []) {
      for (const entry of item?.content ?? []) {
        if (entry?.type === "output_text" && entry?.text) {
          return entry.text;
        }
      }
    }
    return null;
  }

  private async handleSearchIntent(
    prompt: string,
    source: PrometheusBrainSource,
    data: PrometheusBrainPromptDTO,
    user: any,
    companyId: string,
    userId: string,
    role: string,
    intent: PrometheusBrainIntent
  ) {
    const result = await this.agentCommands.handlePrompt(prompt, user);
    const answer = result.handled
      ? result.message
      : "I can help search hazmat loads and trucks. Tell me city, state, equipment, weight, date, or how far back to check.";
    const event = await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "suggestionShown",
      prompt,
      intent,
      tool: "agentCommandSearch",
      message: answer,
      payload: result.metadata ?? {},
      related: data.related,
    });

    return {
      handled: true,
      intent,
      answer,
      eventId: String(event?._id ?? ""),
      metadata: result.metadata ?? {},
    };
  }

  private async handleMapIntent(
    prompt: string,
    source: PrometheusBrainSource,
    data: PrometheusBrainPromptDTO,
    companyId: string,
    userId: string,
    role: string
  ) {
    const routeIntelligence = await this.routingIntelligence.buildRouteIntelligence(
      this.routeRequestFromPrompt(prompt)
    );
    const answer = this.renderRouteIntelligenceAnswer(routeIntelligence);
    const event = await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "suggestionShown",
      prompt,
      intent: "map",
      tool: "routingIntelligence",
      message: answer,
      payload: routeIntelligence as any,
      related: data.related,
    });

    return {
      handled: true,
      intent: "map",
      answer,
      eventId: String(event?._id ?? ""),
      metadata: { routeIntelligence },
    };
  }

  private async createDraftApproval(input: {
    user: any;
    companyId: string;
    source: PrometheusBrainSource;
    prompt: string;
    related?: Record<string, string>;
    actionType: PrometheusBrainActionType;
    label: string;
    summary: string;
    riskNote: string;
  }) {
    const approval = await this.approvals.createRequest({
      companyId: input.companyId,
      requestedBy: String(input.user?._id ?? ""),
      role: String(input.user?.role ?? ""),
      actionType: input.actionType,
      label: input.label,
      summary: input.summary,
      riskNote: input.riskNote,
      payload: {
        prompt: input.prompt,
        related: input.related ?? {},
        providerStatus: "not_connected",
      },
    });

    return {
      handled: true,
      intent: input.actionType,
      answer: `${input.label}: ${input.summary}`,
      approval,
    };
  }

  private renderKnowledgeAnswer(intent: PrometheusBrainIntent, prompt: string) {
    if (intent === "hazmatQuestion") {
      return [
        "I can help frame the hazmat safety check, but you must verify it before dispatch.",
        "Confirm compatibility, placarding, segregation, packaging, route restrictions, and company safety policy against current DOT/PHMSA rules.",
        `Question reviewed: ${prompt}`,
      ].join(" ");
    }

    if (intent === "nearbyService") {
      return "I can prepare nearby-service guidance, but live truck stop, repair, tire, and washout provider search is not connected in Brain V1 yet.";
    }

    return "I can help with hazmat transportation questions, matching, drafts, booking approvals, route context, and written-trail decisions. Tell me the truck, load, city, date, weight, equipment, or action you want reviewed.";
  }

  private routeRequestFromPrompt(prompt: string): RoutingIntelligenceRequestDTO {
    const route = this.extractRouteLabels(prompt);
    return {
      origin: route.origin ? { label: route.origin } : undefined,
      destination: route.destination ? { label: route.destination } : undefined,
      truckLocation: route.truckLocation ? { label: route.truckLocation } : undefined,
      weightLbs: this.extractWeightLbs(prompt),
      equipment: this.extractEquipment(prompt),
    };
  }

  private extractRouteLabels(prompt: string) {
    const text = String(prompt ?? "").replace(/\s+/g, " ").trim();
    const routeMatch = text.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:with\s+truck|truck\s+(?:in|at|near|from)|under|below|max(?:imum)?|less than|for)\b|$)/i);
    const truckMatch = text.match(/\b(?:with\s+)?truck\s+(?:in|at|near|from)\s+(.+?)(?=\s+(?:under|below|max(?:imum)?|less than|for|with)\b|$)/i);

    return {
      origin: this.cleanRouteLabel(routeMatch?.[1]),
      destination: this.cleanRouteLabel(routeMatch?.[2]),
      truckLocation: this.cleanRouteLabel(truckMatch?.[1]),
    };
  }

  private cleanRouteLabel(value: string | undefined): string | undefined {
    const cleaned = String(value ?? "")
      .replace(/[?.!,;:]+$/g, "")
      .trim();
    return cleaned || undefined;
  }

  private extractWeightLbs(prompt: string): number | null {
    const match = String(prompt ?? "").match(/\b(?:under|below|max(?:imum)?|less than)\s+([\d,]+)\s*(?:lb|lbs|pounds)?\b/i);
    if (!match) {
      return null;
    }
    const weight = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(weight) ? weight : null;
  }

  private extractEquipment(prompt: string): string[] {
    const lower = String(prompt ?? "").toLowerCase();
    const equipment = new Set<string>();
    if (/\brz\b|reefer/.test(lower)) equipment.add("RZ");
    if (/\bvz\b|van/.test(lower)) equipment.add("VZ");
    if (/\bflatbed|fb\b/.test(lower)) equipment.add("FB");
    if (/\btanker\b/.test(lower)) equipment.add("Tanker");
    return Array.from(equipment);
  }

  private renderRouteIntelligenceAnswer(route: any): string {
    const lane = `${route.originLabel} to ${route.destinationLabel}`;
    const miles = [
      route.deadheadMiles !== null ? `deadhead ${Math.round(route.deadheadMiles).toLocaleString()} mi` : "deadhead pending",
      route.loadedMiles !== null ? `loaded ${Math.round(route.loadedMiles).toLocaleString()} mi` : "loaded miles pending",
      route.totalMiles !== null ? `total ${Math.round(route.totalMiles).toLocaleString()} mi` : "total miles pending",
    ].join(", ");
    const rpm = route.ratePerLoadedMile !== null
      ? ` Estimated RPM: $${Number(route.ratePerLoadedMile).toFixed(2)}/mi.`
      : "";
    const warnings = Array.isArray(route.providerWarnings) && route.providerWarnings.length
      ? ` Provider warning: ${route.providerWarnings.join(" ")}`
      : "";
    const notes = Array.isArray(route.hazmatNotes) && route.hazmatNotes.length
      ? ` ${route.hazmatNotes.join(" ")}`
      : "";

    return `Route intelligence for ${lane}: ${miles}. Provider status: ${route.providerStatus} through ${route.routeProvider}.${rpm}${warnings}${notes}`;
  }
}
