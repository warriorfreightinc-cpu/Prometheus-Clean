import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model } from "mongoose";
import OpenAI from "openai";
import { ChatbbThread, ChatbbThreadMessage } from "./interface/chatbb-thread.interface";

const nodeFetch: any = require("node-fetch");

if (!(globalThis as any).fetch) {
  (globalThis as any).fetch = nodeFetch;
}
if (!(globalThis as any).Headers) {
  (globalThis as any).Headers = nodeFetch.Headers;
}
if (!(globalThis as any).Request) {
  (globalThis as any).Request = nodeFetch.Request;
}
if (!(globalThis as any).Response) {
  (globalThis as any).Response = nodeFetch.Response;
}
if (!(globalThis as any).FormData) {
  (globalThis as any).FormData = class FormData {};
}

type ViewerRole = "broker" | "carrier";

type ChatbbAction = {
  type: string;
  label: string;
  reason: string;
  requiresApproval: boolean;
};

type ChatbbTopBid = {
  otherPostId: string;
  latestBid: number | null;
  bidCount: number;
  lane: string;
  equipment: string;
  lastMessageAt: string | null;
};

type ChatbbRecentOption = {
  postId: string;
  lane: string;
  rate: number | null;
  equipment: string;
  weight: number | null;
  publishedAt: string | null;
};

type ChatbbPlan = {
  summary: string;
  draftMessage: string;
  recommendedActions: ChatbbAction[];
  riskNotes: string[];
  contextGaps: string[];
  topBids: ChatbbTopBid[];
  recentOptions: ChatbbRecentOption[];
  disclaimer: string;
};

type ChatbbAiRuntimeConfig = {
  mode: "openai" | "local";
  providerLabel: string;
  apiKey: string;
  model: string;
  baseURL?: string;
};

@Injectable()
export class ChatbbService {
  constructor(
    @InjectModel("ChatbbThread") private readonly threadModel: Model<ChatbbThread>,
    @InjectModel("Messages") private readonly messagesModel: Model<any>,
    @InjectModel("brokerPost") private readonly brokerPostModel: Model<any>,
    @InjectModel("carrierPost") private readonly carrierPostModel: Model<any>
  ) {}

  async getThread(user: any, carrierPostId: string, brokerPostId: string) {
    this.assertRealPostIds(carrierPostId, brokerPostId);
    const thread = await this.getOrCreateThread(user, carrierPostId, brokerPostId);
    return {
      threadId: thread._id,
      carrierPostId: thread.carrierPostId,
      brokerPostId: thread.brokerPostId,
      status: thread.status,
      messages: thread.messages
    };
  }

  async buildContextPreview(user: any, carrierPostId: string, brokerPostId: string) {
    this.assertRealPostIds(carrierPostId, brokerPostId);
    return this.buildContext(user.role, carrierPostId, brokerPostId);
  }

  getRuntimeStatus() {
    const runtime = this.getAiRuntimeConfig();
    return {
      enabled: !!runtime,
      mode: runtime?.mode ?? "fallback",
      provider: runtime?.providerLabel ?? "No AI provider configured",
      model: runtime?.model ?? null,
      baseURL: runtime?.baseURL ?? null,
      usesLocalServer: runtime?.mode === "local",
      usesCloudApi: runtime?.mode === "openai"
    };
  }

  async sendMessage(user: any, carrierPostId: string, brokerPostId: string, prompt: string, previewOnly = false) {
    this.assertRealPostIds(carrierPostId, brokerPostId);
    const thread = await this.getOrCreateThread(user, carrierPostId, brokerPostId);
    const createdAt = new Date();

    const userMessage: ChatbbThreadMessage = {
      sender: "user",
      text: prompt,
      createdAt
    };

    if (!previewOnly) {
      thread.messages.push(userMessage);
      await thread.save();
    }

    const context = await this.buildContext(user.role, carrierPostId, brokerPostId);
    const plan = await this.generatePlan(prompt, user.role, context);
    const assistantMessage: ChatbbThreadMessage = {
      sender: "assistant",
      text: this.renderPlan(plan),
      createdAt: new Date(),
      plan
    };

    if (!previewOnly) {
      thread.messages.push(assistantMessage);
      thread.lastContext = context;
      await thread.save();
    }

    return {
      threadId: thread._id,
      userMessage,
      assistantMessage,
      plan,
      context
    };
  }

  private assertRealPostIds(carrierPostId: string, brokerPostId: string) {
    if (isValidObjectId(carrierPostId) && isValidObjectId(brokerPostId)) {
      return;
    }

    throw new BadRequestException(
      "Open a real booking conversation before using room-specific ChatBB. Ask market and matching questions in the AI Matching Console."
    );
  }

  private async getOrCreateThread(user: any, carrierPostId: string, brokerPostId: string) {
    let thread = await this.threadModel.findOne({
      ownerUserId: user._id.toString(),
      ownerRole: user.role,
      carrierPostId,
      brokerPostId
    });

    if (thread) {
      return thread;
    }

    thread = await this.threadModel.create({
      ownerUserId: user._id.toString(),
      ownerRole: user.role,
      ownerCompanyId: user.companyId?.toString?.() ?? user.companyId,
      carrierPostId,
      brokerPostId,
      status: "active",
      messages: [
        {
          sender: "system",
          text: "ChatBB thread created.",
          createdAt: new Date()
        }
      ]
    });

    return thread;
  }

  private async buildContext(viewerRole: ViewerRole, carrierPostId: string, brokerPostId: string) {
    const [sharedRoomRaw, carrierPost, brokerPost] = await Promise.all([
      this.messagesModel.findOne({ carrierPostId, brokerPostId }).lean(),
      this.carrierPostModel.findById(carrierPostId).lean(),
      this.brokerPostModel.findById(brokerPostId).lean()
    ]);
    const sharedRoom: any = sharedRoomRaw;

    if (!carrierPost || !brokerPost) {
      throw new NotFoundException("ChatBB could not load the selected truck/load context.");
    }

    const topBids = await this.buildTopBids(viewerRole, carrierPostId, brokerPostId);
    const recentOptions = viewerRole === "carrier"
      ? await this.findRecentBrokerOptions(carrierPost, brokerPostId)
      : await this.findRecentCarrierOptions(brokerPost, carrierPostId);

    return {
      generatedAt: new Date().toISOString(),
      viewerRole,
      carrierPost: this.summarizeCarrierPost(carrierPost),
      brokerPost: this.summarizeBrokerPost(brokerPost),
      sharedRoom: {
        messageCount: sharedRoom?.messages?.length ?? 0,
        latestBid: this.extractLatestBid(sharedRoom?.messages ?? []),
        messages: this.summarizeMessages(sharedRoom?.messages ?? [])
      },
      topBids,
      recentOptions,
      dataLimitations: [
        "Do not assume FMCSA, DOT, ELD, or tracking details unless they are explicitly present.",
        "Do not assume safety scores, reviews, or payment history unless they are explicitly present.",
        "Do not claim booking or availability unless the shared context explicitly says so."
      ]
    };
  }

  private summarizeMessages(messages: any[]) {
    return messages.slice(-12).map((message) => ({
      type: message.type ?? "message",
      role: message.role ?? "unknown",
      text: message.text ?? null,
      bid: typeof message.bid === "number" ? message.bid : null,
      date: this.toIso(message.date)
    }));
  }

  private summarizeCarrierPost(post: any) {
    return {
      id: post._id?.toString?.() ?? post._id,
      lane: this.formatLane(post.origin, post.destination),
      equipment: this.formatEquipment(post.equipment, post.length),
      capacity: post.capacity ?? null,
      weight: this.asNumberOrNull(post.weight),
      readyDate: this.formatDate(post.startDate),
      endDate: this.formatDate(post.endDate),
      comment: post.comment ?? null
    };
  }

  private summarizeBrokerPost(post: any) {
    return {
      id: post._id?.toString?.() ?? post._id,
      lane: this.formatLane(post.origin, post.destination),
      equipment: this.formatEquipment(post.equipment, post.length),
      capacity: post.capacity ?? null,
      weight: this.asNumberOrNull(post.weight),
      rate: this.asNumberOrNull(post.rate),
      publishedAt: this.formatDate(post.publishedAt),
      comment: post.comment ?? null
    };
  }

  private async buildTopBids(viewerRole: ViewerRole, carrierPostId: string, brokerPostId: string): Promise<ChatbbTopBid[]> {
    const rooms = await this.messagesModel.find(
      viewerRole === "broker" ? { brokerPostId } : { carrierPostId }
    ).lean();

    if (!rooms.length) {
      return [];
    }

    const otherPostIds = rooms.map((room) => viewerRole === "broker" ? room.carrierPostId : room.brokerPostId);
    const otherPosts = viewerRole === "broker"
      ? await this.carrierPostModel.find({ _id: { $in: otherPostIds } }).lean()
      : await this.brokerPostModel.find({ _id: { $in: otherPostIds } }).lean();

    const otherPostsMap = new Map(otherPosts.map((post) => [post._id.toString(), post]));

    return rooms
      .map((room) => {
        const latestBid = this.extractLatestBid(room.messages ?? []);
        const bidCount = (room.messages ?? []).filter((message) => message.type === "bid").length;
        const otherPostId = viewerRole === "broker" ? room.carrierPostId : room.brokerPostId;
        const otherPost = otherPostsMap.get(otherPostId);
        const lastMessage = room.messages?.length ? room.messages[room.messages.length - 1] : null;

        return {
          otherPostId,
          latestBid,
          bidCount,
          lane: otherPost ? this.formatLane(otherPost.origin, otherPost.destination) : "Unknown lane",
          equipment: otherPost ? this.formatEquipment(otherPost.equipment, otherPost.length) : "Unknown equipment",
          lastMessageAt: this.toIso(lastMessage?.date ?? null)
        };
      })
      .filter((room) => room.latestBid !== null || room.bidCount > 0)
      .sort((a, b) => {
        const bidA = a.latestBid ?? -1;
        const bidB = b.latestBid ?? -1;
        if (bidA !== bidB) {
          return bidB - bidA;
        }
        return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
      })
      .slice(0, 5);
  }

  private async findRecentBrokerOptions(carrierPost: any, currentBrokerPostId: string): Promise<ChatbbRecentOption[]> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates = await this.brokerPostModel.find({
      _id: { $ne: currentBrokerPostId },
      publishedAt: { $gte: dayAgo }
    }).sort({ publishedAt: -1 }).limit(60).lean();

    return candidates
      .map((candidate) => ({ post: candidate, score: this.scoreBrokerCandidateForCarrier(candidate, carrierPost) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) {
          return b.score - a.score;
        }
        return (b.post.rate ?? 0) - (a.post.rate ?? 0);
      })
      .slice(0, 8)
      .map(({ post }) => ({
        postId: post._id.toString(),
        lane: this.formatLane(post.origin, post.destination),
        rate: this.asNumberOrNull(post.rate),
        equipment: this.formatEquipment(post.equipment, post.length),
        weight: this.asNumberOrNull(post.weight),
        publishedAt: this.formatDate(post.publishedAt)
      }));
  }

  private async findRecentCarrierOptions(brokerPost: any, currentCarrierPostId: string): Promise<ChatbbRecentOption[]> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates = await this.carrierPostModel.find({
      _id: { $ne: currentCarrierPostId },
      publishedAt: { $gte: dayAgo }
    }).sort({ publishedAt: -1 }).limit(60).lean();

    return candidates
      .map((candidate) => ({ post: candidate, score: this.scoreCarrierCandidateForBroker(candidate, brokerPost) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ post }) => ({
        postId: post._id.toString(),
        lane: this.formatLane(post.origin, post.destination),
        rate: null,
        equipment: this.formatEquipment(post.equipment, post.length),
        weight: this.asNumberOrNull(post.weight),
        publishedAt: this.formatDate(post.publishedAt)
      }));
  }

  private scoreBrokerCandidateForCarrier(candidate: any, carrierPost: any) {
    let score = 0;
    if (this.hasEquipmentMatch(candidate.equipment, carrierPost.equipment)) score += 2;
    if (this.asNumberOrNull(candidate.length) !== null && this.asNumberOrNull(carrierPost.length) !== null && Number(candidate.length) <= Number(carrierPost.length)) score += 1;
    if (this.asNumberOrNull(candidate.weight) !== null && this.asNumberOrNull(carrierPost.weight) !== null && Number(candidate.weight) <= Number(carrierPost.weight)) score += 1;
    if (this.hasStateOverlap(candidate.origin, carrierPost.origin)) score += 2;
    if (this.hasStateOverlap(candidate.destination, carrierPost.destination)) score += 2;
    return score;
  }

  private scoreCarrierCandidateForBroker(candidate: any, brokerPost: any) {
    let score = 0;
    if (this.hasEquipmentMatch(candidate.equipment, brokerPost.equipment)) score += 2;
    if (this.asNumberOrNull(candidate.length) !== null && this.asNumberOrNull(brokerPost.length) !== null && Number(candidate.length) >= Number(brokerPost.length)) score += 1;
    if (this.asNumberOrNull(candidate.weight) !== null && this.asNumberOrNull(brokerPost.weight) !== null && Number(candidate.weight) >= Number(brokerPost.weight)) score += 1;
    if (this.hasStateOverlap(candidate.origin, brokerPost.origin)) score += 2;
    if (this.hasStateOverlap(candidate.destination, brokerPost.destination)) score += 2;
    return score;
  }

  private hasEquipmentMatch(a: any[] = [], b: any[] = []) {
    const setA = new Set((a ?? []).map((item) => String(item).toLowerCase()));
    return (b ?? []).some((item) => setA.has(String(item).toLowerCase()));
  }

  private hasStateOverlap(a: any, b: any) {
    const statesA = this.extractStates(a);
    const statesB = this.extractStates(b);
    return statesA.some((state) => statesB.includes(state));
  }

  private extractStates(location: any) {
    if (!location) {
      return [];
    }
    if (location.type === "place" && location.place?.state) {
      return [String(location.place.state).toUpperCase()];
    }
    if (location.type === "states" && Array.isArray(location.states)) {
      return location.states.map((state) => String(state).toUpperCase());
    }
    return [];
  }

  private extractLatestBid(messages: any[]) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message?.type === "bid") {
        return Number(message.bid ?? message.text);
      }
    }
    return null;
  }

  private formatLane(origin: any, destination: any) {
    return `${this.formatLocation(origin)} -> ${this.formatLocation(destination)}`;
  }

  private formatLocation(location: any) {
    if (!location) {
      return "Unknown";
    }
    if (location.type === "place" && location.place) {
      return `${location.place.city}, ${location.place.state}`;
    }
    if (location.type === "states" && Array.isArray(location.states)) {
      return location.states.join(", ");
    }
    if (location.type === "zones" && Array.isArray(location.zones)) {
      return location.zones.map((zone) => zone.zone).join(", ");
    }
    return "Unknown";
  }

  private formatEquipment(equipment: any[] = [], length?: number) {
    const equipmentText = Array.isArray(equipment) && equipment.length ? equipment.join(", ") : "Unspecified equipment";
    return length ? `${equipmentText} ${length}'` : equipmentText;
  }

  private formatDate(value: any) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  private toIso(value: any) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  private asNumberOrNull(value: any) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private getAiRuntimeConfig(): ChatbbAiRuntimeConfig | null {
    const baseURL = process.env.OPENAI_BASE_URL?.trim();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const configuredModel = process.env.OPENAI_MODEL?.trim();

    if (baseURL) {
      return {
        mode: "local",
        providerLabel: "Local OpenAI-compatible server",
        apiKey: apiKey || "lm-studio",
        model: configuredModel || "openai/gpt-oss-20b",
        baseURL
      };
    }

    if (apiKey) {
      return {
        mode: "openai",
        providerLabel: "OpenAI",
        apiKey,
        model: configuredModel || "gpt-5.4-mini"
      };
    }

    return null;
  }

  private async generatePlan(prompt: string, viewerRole: ViewerRole, context: any): Promise<ChatbbPlan> {
    const runtime = this.getAiRuntimeConfig();
    if (!runtime) {
      return this.buildFallbackPlan(prompt, viewerRole, context, [
        "No AI provider is configured yet, so ChatBB returned a built-in fallback answer."
      ]);
    }

    try {
      const plan = runtime.mode === "local"
        ? await this.generatePlanWithLocalRuntime(runtime, prompt, viewerRole, context)
        : await this.generatePlanWithOpenAi(runtime, prompt, viewerRole, context);

      plan.topBids = Array.isArray(plan.topBids) ? plan.topBids : context.topBids;
      plan.recentOptions = Array.isArray(plan.recentOptions) ? plan.recentOptions : context.recentOptions;
      return plan;
    } catch (error: any) {
      const message = error?.error?.message || error?.response?.data?.error?.message || error?.message || "Unknown OpenAI error";
      return this.buildFallbackPlan(prompt, viewerRole, context, [
        `ChatBB used a built-in fallback because the ${runtime.providerLabel} request failed: ${message}`
      ]);
    }
  }

  private buildSystemPrompt() {
    return [
      "You are ChatBB, the official Prometheus chat bidding assistant.",
      "You help U.S. dispatchers and brokers inside Prometheus move faster in chat.",
      "You are not a phone bot and not a compliance bot.",
      "Do not invent FMCSA, DOT, ELD, tracking, safety score, reviews, payment history, or company identity details.",
      "Only use the supplied context.",
      "If data is missing, say it is missing.",
      "Never claim a load is available, booked, tracked, or confirmed unless that appears in the context.",
      "Never book, dispatch, or confirm without human approval.",
      "Use long U.S. dates like April 7, 2026."
    ].join(" ");
  }

  private buildLocalSystemPrompt() {
    return [
      this.buildSystemPrompt(),
      "Return exactly one valid JSON object.",
      "Do not include markdown fences, bullets, commentary, or any text before or after the JSON.",
      `The JSON must match this schema: ${JSON.stringify(this.buildPlanSchema())}`
    ].join(" ");
  }

  private buildPlanSchema() {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        draftMessage: { type: "string" },
        recommendedActions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string" },
              label: { type: "string" },
              reason: { type: "string" },
              requiresApproval: { type: "boolean" }
            },
            required: ["type", "label", "reason", "requiresApproval"]
          }
        },
        riskNotes: { type: "array", items: { type: "string" } },
        contextGaps: { type: "array", items: { type: "string" } },
        topBids: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              otherPostId: { type: "string" },
              latestBid: { type: ["number", "null"] },
              bidCount: { type: "number" },
              lane: { type: "string" },
              equipment: { type: "string" },
              lastMessageAt: { type: ["string", "null"] }
            },
            required: ["otherPostId", "latestBid", "bidCount", "lane", "equipment", "lastMessageAt"]
          }
        },
        recentOptions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              postId: { type: "string" },
              lane: { type: "string" },
              rate: { type: ["number", "null"] },
              equipment: { type: "string" },
              weight: { type: ["number", "null"] },
              publishedAt: { type: ["string", "null"] }
            },
            required: ["postId", "lane", "rate", "equipment", "weight", "publishedAt"]
          }
        },
        disclaimer: { type: "string" }
      },
      required: ["summary", "draftMessage", "recommendedActions", "riskNotes", "contextGaps", "topBids", "recentOptions", "disclaimer"]
    };
  }

  private extractOutputText(response: any) {
    if (response?.output_text) {
      return response.output_text;
    }
    const output = response?.output ?? [];
    for (const item of output) {
      const content = item?.content ?? [];
      for (const entry of content) {
        if (entry?.type === "output_text" && entry?.text) {
          return entry.text;
        }
      }
    }
    return null;
  }

  private async generatePlanWithOpenAi(runtime: ChatbbAiRuntimeConfig, prompt: string, viewerRole: ViewerRole, context: any) {
    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseURL,
      fetch: nodeFetch
    });

    const response = await client.responses.create({
      model: runtime.model,
      store: false,
      temperature: 0.2,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: this.buildSystemPrompt() }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify({ viewerRole, prompt, context }) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "chatbb_plan",
          strict: true,
          schema: this.buildPlanSchema()
        },
        verbosity: "medium"
      }
    });

    const outputText = response.output_text || this.extractOutputText(response);
    if (!outputText) {
      throw new Error("No structured output was returned.");
    }

    return this.parsePlanText(outputText);
  }

  private async generatePlanWithLocalRuntime(runtime: ChatbbAiRuntimeConfig, prompt: string, viewerRole: ViewerRole, context: any) {
    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseURL,
      fetch: nodeFetch
    });

    const response = await client.chat.completions.create({
      model: runtime.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: this.buildLocalSystemPrompt() },
        { role: "user", content: JSON.stringify({ viewerRole, prompt, context }) }
      ]
    });

    const outputText = response.choices?.[0]?.message?.content;
    if (!outputText) {
      throw new Error("No chat completion content was returned.");
    }

    return this.parsePlanText(outputText);
  }

  private parsePlanText(outputText: string): ChatbbPlan {
    const normalizedText = this.extractJsonPayload(outputText);
    return JSON.parse(normalizedText) as ChatbbPlan;
  }

  private extractJsonPayload(outputText: string) {
    const trimmed = outputText.trim();
    if (!trimmed) {
      throw new Error("No JSON payload was returned.");
    }

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return this.extractJsonPayload(fencedMatch[1]);
    }

    const objectMatch = this.findFirstJsonObject(trimmed);
    if (objectMatch) {
      return objectMatch;
    }

    throw new Error("No JSON object found in model output.");
  }

  private findFirstJsonObject(text: string) {
    let startIndex = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index++) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\") {
          escaped = true;
          continue;
        }
        if (character === "\"") {
          inString = false;
        }
        continue;
      }

      if (character === "\"") {
        inString = true;
        continue;
      }

      if (character === "{") {
        if (depth === 0) {
          startIndex = index;
        }
        depth++;
        continue;
      }

      if (character === "}") {
        if (depth === 0) {
          continue;
        }
        depth--;
        if (depth === 0 && startIndex >= 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

    return null;
  }

  private buildFallbackPlan(prompt: string, viewerRole: ViewerRole, context: any, extraRiskNotes: string[] = []): ChatbbPlan {
    const promptLower = prompt.toLowerCase();
    const riskNotes = [...extraRiskNotes];
    const contextGaps: string[] = [];
    const recommendedActions: ChatbbAction[] = [];
    let summary = `ChatBB reviewed the ${viewerRole === "carrier" ? "truck" : "load"} conversation and found ${context.sharedRoom.messageCount} shared messages.`;
    let draftMessage = "";

    if (promptLower.includes("best") && promptLower.includes("bid")) {
      summary = context.topBids.length
        ? `Top bid view is ready. I found ${context.topBids.length} active bid thread${context.topBids.length === 1 ? "" : "s"} for this post.`
        : "No active bids were found for this post yet.";
      recommendedActions.push({
        type: "show_top_bids",
        label: "Review top bids",
        reason: "These are the strongest live bid threads in the current post context.",
        requiresApproval: false
      });
    } else if (promptLower.includes("counter")) {
      const suggestedBid = this.pickCounterNumber(promptLower, context);
      draftMessage = suggestedBid
        ? `Counter offer from Prometheus ChatBB: we can do $${suggestedBid}. If that works on your side, please confirm and we can move forward.`
        : "Counter offer from Prometheus ChatBB: please send your best revised rate and I will review the next step.";
      summary = "ChatBB prepared a counter-offer draft based on the current room context.";
      recommendedActions.push({
        type: "draft_counter_offer",
        label: "Send counter offer",
        reason: "The room already has pricing activity, so a clean counter is the fastest next step.",
        requiresApproval: true
      });
    } else if (promptLower.includes("available")) {
      draftMessage = "Hi, this is ChatBB from Prometheus. Is this load still available? If yes, please confirm the current rate and pickup timing.";
      summary = "ChatBB prepared an availability check draft for the selected option.";
      recommendedActions.push({
        type: "draft_availability_check",
        label: "Ask if still available",
        reason: "The next safe step is to verify live availability before booking activity.",
        requiresApproval: true
      });
    } else if (promptLower.includes("24") || promptLower.includes("option") || promptLower.includes("load") || promptLower.includes("truck")) {
      summary = context.recentOptions.length
        ? `ChatBB found ${context.recentOptions.length} recent option${context.recentOptions.length === 1 ? "" : "s"} from the last 24 hours that roughly fit the selected post.`
        : "ChatBB did not find a strong recent option match in the last 24 hours using the current local matching rules.";
      recommendedActions.push({
        type: "review_recent_options",
        label: "Review recent options",
        reason: "These options are the closest current match to the selected post based on lane and equipment.",
        requiresApproval: false
      });
    } else {
      summary = `ChatBB reviewed ${context.carrierPost.lane} against ${context.brokerPost.lane} and prepared the next best workflow suggestions.`;
      draftMessage = viewerRole === "carrier"
        ? "Hi, this is ChatBB from Prometheus. We can submit a rate on this lane. Please confirm if you want me to draft it."
        : "Hi, this is ChatBB from Prometheus. I can help review the current bids and prepare the next counter-offer.";
    }

    if (!context.topBids.length) {
      riskNotes.push("There is no current bid ranking in this context yet.");
    }
    if (!context.recentOptions.length) {
      contextGaps.push("No recent alternative options were found with the current 24-hour local match scan.");
    }
    if (!recommendedActions.length) {
      recommendedActions.push({
        type: "summarize_room",
        label: "Review room summary",
        reason: "Start by confirming the room details before taking the next pricing step.",
        requiresApproval: false
      });
    }

    return {
      summary,
      draftMessage,
      recommendedActions,
      riskNotes,
      contextGaps,
      topBids: context.topBids,
      recentOptions: context.recentOptions,
      disclaimer: "ChatBB used only the supplied Prometheus context. Anything involving booking, dispatch, or confirmation still needs human approval."
    };
  }

  private pickCounterNumber(promptLower: string, context: any) {
    const matches = promptLower.match(/\$?\d+(?:,\d{3})*(?:\.\d+)?/g);
    if (matches?.length) {
      const parsed = Number(matches[matches.length - 1].replace(/\$/g, "").replace(/,/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    if (typeof context.sharedRoom.latestBid === "number") {
      return context.sharedRoom.latestBid;
    }
    if (typeof context.brokerPost.rate === "number") {
      return context.brokerPost.rate;
    }
    return null;
  }

  private renderPlan(plan: ChatbbPlan) {
    const lines: string[] = [];
    lines.push(`ChatBB Summary: ${plan.summary}`);

    if (plan.topBids.length) {
      lines.push("");
      lines.push("Top Bids:");
      plan.topBids.forEach((bid, index) => {
        const bidText = bid.latestBid === null ? "No bid yet" : `$${bid.latestBid}`;
        lines.push(`${index + 1}. ${bid.lane} | ${bid.equipment} | ${bidText}`);
      });
    }

    if (plan.recentOptions.length) {
      lines.push("");
      lines.push("Recent Options:");
      plan.recentOptions.slice(0, 5).forEach((option, index) => {
        const rateText = option.rate === null ? "Rate not listed" : `$${option.rate}`;
        lines.push(`${index + 1}. ${option.lane} | ${option.equipment} | ${rateText}`);
      });
    }

    if (plan.draftMessage) {
      lines.push("");
      lines.push(`Draft Message: ${plan.draftMessage}`);
    }

    if (plan.recommendedActions.length) {
      lines.push("");
      lines.push("Next Actions:");
      plan.recommendedActions.forEach((action) => {
        const approval = action.requiresApproval ? "approval needed" : "ready";
        lines.push(`- ${action.label} (${approval}): ${action.reason}`);
      });
    }

    if (plan.riskNotes.length) {
      lines.push("");
      lines.push("Risk Notes:");
      plan.riskNotes.forEach((note) => lines.push(`- ${note}`));
    }

    if (plan.contextGaps.length) {
      lines.push("");
      lines.push("Missing Data:");
      plan.contextGaps.forEach((gap) => lines.push(`- ${gap}`));
    }

    lines.push("");
    lines.push(plan.disclaimer);
    return lines.join("\n");
  }
}
