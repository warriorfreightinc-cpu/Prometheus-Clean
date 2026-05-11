import { BadRequestException, Injectable } from "@nestjs/common";
import { AgentCommandService } from "../matching/agent-command.service";
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

@Injectable()
export class PrometheusBrainService {
  constructor(
    private readonly events: BrainEventService,
    private readonly approvals: BrainApprovalService,
    private readonly memory: BrainMemoryService,
    private readonly agentCommands: AgentCommandService
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

    if (parsed.intent === "search" || parsed.intent === "map") {
      return this.handleSearchIntent(prompt, source, data, user, companyId, userId, role, parsed.intent);
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

    const answer = this.renderKnowledgeAnswer(parsed.intent, prompt);
    const event = await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "suggestionShown",
      prompt,
      intent: parsed.intent,
      tool: "deterministicTransportationAnswer",
      message: answer,
    });

    return {
      handled: true,
      intent: parsed.intent,
      answer,
      eventId: String(event?._id ?? ""),
    };
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
}
