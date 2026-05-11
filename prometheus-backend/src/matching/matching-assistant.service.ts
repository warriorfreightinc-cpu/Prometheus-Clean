import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AppGateway } from "src/gateway/app.gateway";
import { MessagesService } from "src/messages/messages.service";
import { AgentCommandService } from "./agent-command.service";
import { MatchingAssistantCommandDTO } from "./dto/matching-assistant.dto";
import { MatchOpportunity } from "./interface/match-opportunity.interface";
import {
  MatchingAssistantCommand,
  MatchingAssistantEvent,
} from "./interface/matching-assistant-event.interface";

@Injectable()
export class MatchingAssistantService {
  constructor(
    @InjectModel("matchOpportunity")
    private readonly opportunityModel: Model<MatchOpportunity>,
    @InjectModel("matchingAssistantEvent")
    private readonly eventModel: Model<MatchingAssistantEvent>,
    private readonly messagesService: MessagesService,
    private readonly gateway: AppGateway,
    private readonly agentCommandService: AgentCommandService
  ) {}

  async listEvents(user: any) {
    const userId = this.idOf(user?._id);
    const companyId = this.idOf(user?.companyId);
    const targetRole = this.idOf(user?.role);
    const companyRoleFilters = [
      { targetRole: "" },
      { targetRole: { $exists: false } },
      ...(targetRole ? [{ targetRole }] : []),
    ];
    const events = await this.eventModel
      .find({
        $or: [
          { userId },
          {
            companyId,
            $and: [
              { $or: [{ userId: "" }, { userId: { $exists: false } }] },
              { $or: companyRoleFilters },
            ],
          },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<any>();

    return events.reverse();
  }

  async createSourceSuggestion(
    companyId: string,
    userId: string,
    sourcePostId: string
  ) {
    const opportunities = await this.findRankedOpportunities(companyId, sourcePostId);
    const best = opportunities[0];
    const event = await this.createEvent({
      companyId,
      userId,
      role: "assistant",
      sourcePostId,
      relatedOpportunityId: this.optionalId(best?._id),
      message: this.renderSuggestion(opportunities),
      availableCommands: this.commandsForOpportunities(opportunities),
    });

    this.broadcast(userId, event);
    return event;
  }

  async createCounterpartSuggestions(opportunities: any[] = []) {
    const events = [];

    for (const opportunity of opportunities) {
      const counterpart = this.participantSide(opportunity, "candidate");
      if (!counterpart.companyId || !counterpart.postId) {
        continue;
      }

      const targetRole = this.roleForPostType(counterpart.postType);
      const dedupeKey = this.counterpartSuggestionDedupeKey(
        opportunity,
        counterpart.postId
      );
      if (await this.hasEventDedupeKey(dedupeKey)) {
        continue;
      }

      const targetRoom = counterpart.publisherId
        || `${counterpart.companyId}_${targetRole}`;
      try {
        const event = await this.createEvent({
          companyId: counterpart.companyId,
          userId: counterpart.publisherId || undefined,
          targetRole,
          dedupeKey,
          role: "assistant",
          sourcePostId: counterpart.postId,
          relatedOpportunityId: this.optionalId(opportunity?._id),
          message: this.renderCounterpartSuggestion(opportunity),
          availableCommands: [
            { command: "show matches", label: "Show matches" },
          ],
        });

        this.broadcast(targetRoom, event);
        events.push(event);
      } catch (error: any) {
        if (error?.code === 11000) {
          continue;
        }
        throw error;
      }
    }

    return events;
  }

  async askCounterpart(opportunityId: string, user: any) {
    const opportunity = await this.loadOpportunity(opportunityId);
    const requesterSide = this.authorizeParticipant(opportunity, user);
    await this.opportunityModel.findByIdAndUpdate(
      opportunityId,
      { $set: { permissionStatus: "asked", status: "negotiating" } },
      { new: true }
    );

    const requesterId = this.idOf(user?._id);
    const targetSide = this.counterpartSide(opportunity, requesterSide.side);
    const targetUserId = targetSide.publisherId;
    const event = await this.createEvent({
      companyId: targetSide.companyId,
      userId: targetUserId,
      role: "assistant",
      sourcePostId: targetSide.postId,
      relatedOpportunityId: opportunityId,
      message: opportunity.permissionQuestion || "Can this hazmat option work for your posting?",
      availableCommands: [
        { command: "accept", label: "Accept fit", opportunityId },
        { command: "reject", label: "Reject fit", opportunityId },
      ],
    });

    this.broadcast(targetUserId, event);

    if (requesterId && requesterId !== targetUserId) {
      const confirmation = await this.createEvent({
        companyId: requesterSide.companyId,
        userId: requesterId,
        role: "assistant",
        sourcePostId: requesterSide.postId,
        relatedOpportunityId: opportunityId,
        message: "I asked the counterpart whether this hazmat equipment substitution works.",
        availableCommands: [
          { command: "show matches", label: "Show matches" },
          { command: "book option 1", label: "Book option 1", opportunityId },
        ],
      });
      this.broadcast(requesterId, confirmation);
    }

    return event;
  }

  async handleAction(
    opportunityId: string,
    action: "ask" | "accept" | "reject" | "book",
    user: any
  ) {
    if (action === "ask") {
      return this.askCounterpart(opportunityId, user);
    }
    if (action === "reject") {
      return this.rejectOpportunity(opportunityId, user);
    }
    if (action === "accept") {
      return this.acceptOpportunity(opportunityId, user);
    }
    if (action === "book") {
      return this.createBookingRoom(opportunityId, user);
    }
    throw new BadRequestException("Unsupported opportunity action.");
  }

  async handleCommand(data: MatchingAssistantCommandDTO, user: any) {
    const prompt = String(data?.prompt ?? "").trim();
    const sourcePostId = String(data?.sourcePostId ?? "").trim();
    const normalized = prompt.toLowerCase();
    const companyId = this.idOf(user?.companyId);
    const userId = this.idOf(user?._id);

    if (prompt) {
      const userEvent = await this.createEvent({
        companyId,
        userId,
        role: "user",
        sourcePostId: sourcePostId || undefined,
        message: prompt,
        availableCommands: [],
      });
      this.broadcast(userId, userEvent);
    }

    if (prompt) {
      const agentResult = await this.agentCommandService.handlePrompt(prompt, user);
      if (agentResult.handled) {
        const event = await this.createEvent({
          companyId,
          userId,
          role: "assistant",
          sourcePostId: sourcePostId || agentResult.sourcePostId || undefined,
          message: agentResult.message,
          availableCommands: [],
        });
        this.broadcast(userId, event);
        return event;
      }
    }

    if (normalized === "show matches" || normalized === "show next") {
      return this.createSourceSuggestion(companyId, userId, sourcePostId);
    }

    const indexMatch = normalized.match(/(?:ask about|ask|book option|book match|book)\s+(\d+)/);
    if (indexMatch && sourcePostId) {
      const index = Number(indexMatch[1]) - 1;
      const opportunities = await this.findRankedOpportunities(companyId, sourcePostId);
      const opportunity = opportunities[index];
      if (!opportunity) {
        const event = await this.createEvent({
          companyId,
          userId,
          role: "assistant",
          sourcePostId,
          message: "That option number is not available. Type show matches to see the current options.",
          availableCommands: [{ command: "show matches", label: "Show matches" }],
        });
        this.broadcast(userId, event);
        return event;
      }

      if (normalized.includes("book")) {
        return this.createBookingRoom(this.idOf(opportunity._id), user);
      }

      return this.askCounterpart(this.idOf(opportunity._id), user);
    }

    return this.createSourceSuggestion(companyId, userId, sourcePostId);
  }

  private async rejectOpportunity(opportunityId: string, user: any) {
    const opportunity = await this.loadOpportunity(opportunityId);
    const requesterSide = this.authorizeParticipant(opportunity, user);
    await this.opportunityModel.findByIdAndUpdate(
      opportunityId,
      { $set: { permissionStatus: "rejected", status: "rejected" } },
      { new: true }
    );

    const event = await this.createEvent({
      companyId: requesterSide.companyId,
      userId: requesterSide.publisherId,
      role: "assistant",
      sourcePostId: requesterSide.postId,
      relatedOpportunityId: opportunityId,
      message: "That option was rejected. Prometheus will suggest the next hazmat option if one is available.",
      availableCommands: [{ command: "show matches", label: "Show matches" }],
    });
    this.broadcast(requesterSide.publisherId, event);

    const targetSide = this.counterpartSide(opportunity, requesterSide.side);
    if (targetSide.publisherId) {
      const counterpartEvent = await this.createEvent({
        companyId: targetSide.companyId,
        userId: targetSide.publisherId,
        role: "assistant",
        sourcePostId: targetSide.postId,
        relatedOpportunityId: opportunityId,
        message: "The counterpart rejected this hazmat match option.",
        availableCommands: [{ command: "show matches", label: "Show matches" }],
      });
      this.broadcast(targetSide.publisherId, counterpartEvent);
    }

    return event;
  }

  private async acceptOpportunity(opportunityId: string, user: any) {
    const opportunity = await this.loadOpportunity(opportunityId);
    const requesterSide = this.authorizeParticipant(opportunity, user);
    await this.opportunityModel.findByIdAndUpdate(
      opportunityId,
      { $set: { permissionStatus: "accepted", status: "negotiating" } },
      { new: true }
    );

    const requesterId = this.idOf(user?._id);
    const targetSide = this.counterpartSide(opportunity, requesterSide.side);
    const targetUserId = targetSide.publisherId;
    const event = await this.createEvent({
      companyId: requesterSide.companyId,
      userId: requesterSide.publisherId,
      role: "assistant",
      sourcePostId: requesterSide.postId,
      relatedOpportunityId: opportunityId,
      message: "Permission accepted. This option can move forward toward booking.",
      availableCommands: [{ command: "book option 1", label: "Book option 1", opportunityId }],
    });
    this.broadcast(requesterSide.publisherId, event);

    if (targetUserId && targetUserId !== requesterId) {
      const counterpartEvent = await this.createEvent({
        companyId: targetSide.companyId,
        userId: targetUserId,
        role: "assistant",
        sourcePostId: targetSide.postId,
        relatedOpportunityId: opportunityId,
        message: "The counterpart accepted the hazmat permission question.",
        availableCommands: [{ command: "book option 1", label: "Book option 1", opportunityId }],
      });
      this.broadcast(targetUserId, counterpartEvent);
    }

    return event;
  }

  private async createBookingRoom(opportunityId: string, user: any) {
    const opportunity = await this.loadOpportunity(opportunityId);
    const requesterSide = this.authorizeParticipant(opportunity, user);
    const targetSide = this.counterpartSide(opportunity, requesterSide.side);
    const userRole = this.roleForPostType(requesterSide.postType);
    const room = await this.messagesService.createRoom(
      {
        myPostId: requesterSide.postId,
        otherPostId: targetSide.postId,
        otherUserId: targetSide.publisherId,
      },
      requesterSide.publisherId,
      userRole
    );

    await this.opportunityModel.findByIdAndUpdate(
      opportunityId,
      { $set: { status: "approvedForBooking" } },
      { new: true }
    );
    await this.opportunityModel.updateMany(
      this.samePostPairFilter(opportunity),
      { $set: { status: "approvedForBooking" } }
    );

    const event = await this.createEvent({
      companyId: requesterSide.companyId,
      userId: requesterSide.publisherId,
      role: "assistant",
      sourcePostId: requesterSide.postId,
      relatedOpportunityId: opportunityId,
      message: "Booking chat is ready. Open Booking Chat to continue approval.",
      availableCommands: [],
    });
    this.broadcast(requesterSide.publisherId, event);

    if (targetSide.publisherId) {
      const counterpartEvent = await this.createEvent({
        companyId: targetSide.companyId,
        userId: targetSide.publisherId,
        role: "assistant",
        sourcePostId: targetSide.postId,
        relatedOpportunityId: opportunityId,
        message: "Booking chat is ready for this hazmat match.",
        availableCommands: [],
      });
      this.broadcast(targetSide.publisherId, counterpartEvent);
    }

    return room;
  }

  private async findRankedOpportunities(companyId: string, sourcePostId: string) {
    return this.opportunityModel
      .find({ companyId, sourcePostId, status: { $in: ["suggested", "negotiating"] } })
      .sort({ tierRank: 1, score: -1, updatedAt: -1 })
      .limit(5)
      .lean<any>();
  }

  private async loadOpportunity(opportunityId: string) {
    const opportunity = await this.opportunityModel.findById(opportunityId).lean<any>();
    if (!opportunity) {
      throw new NotFoundException("Match opportunity was not found.");
    }
    return opportunity;
  }

  private async createEvent(event: Partial<MatchingAssistantEvent>) {
    return this.eventModel.create({
      availableCommands: [],
      ...event,
    });
  }

  private async hasEventDedupeKey(dedupeKey: string): Promise<boolean> {
    if (!dedupeKey) {
      return false;
    }
    const existing = await this.eventModel.findOne({ dedupeKey }).lean<any>();
    return Boolean(existing);
  }

  private counterpartSuggestionDedupeKey(
    opportunity: any,
    counterpartPostId: string
  ): string {
    const opportunityId = this.idOf(opportunity?._id);
    const sourcePostId = this.idOf(opportunity?.sourcePostId);
    const sourceKey = opportunityId || `${sourcePostId}:${counterpartPostId}`;
    return `counterpart:${sourceKey}:${counterpartPostId}`;
  }

  private renderSuggestion(opportunities: any[]): string {
    if (!opportunities.length) {
      return "No hazmat matches are available yet. Prometheus will keep watching, and widening the date, weight, or equipment filters may surface more options.";
    }

    const best = opportunities[0];
    if (best.tier === "hazmatPermission") {
      return `No exact hazmat match is available. Option 1 may work with permission: ${best.permissionQuestion} Type "ask about 1" if you want me to ask.`;
    }

    return `I found ${opportunities.length} hazmat option${opportunities.length === 1 ? "" : "s"}. Option 1 is the strongest fit. Type "ask about 1" or "book option 1".`;
  }

  private renderCounterpartSuggestion(opportunity: any): string {
    const sourceType = this.idOf(opportunity?.sourcePostType);
    const postedCounterpart = sourceType === "carrierPost" ? "truck" : "load";
    const ownedPosting = sourceType === "carrierPost" ? "load" : "truck";
    const permissionQuestion = this.idOf(opportunity?.permissionQuestion);
    const permissionNote = permissionQuestion
      ? ` This may need confirmation: ${permissionQuestion}`
      : "";

    return `A matching hazmat ${postedCounterpart} just posted for your ${ownedPosting}.${permissionNote} Type "show matches" to review the updated options.`;
  }

  private commandsForOpportunities(opportunities: any[]): MatchingAssistantCommand[] {
    return opportunities.slice(0, 3).flatMap((opportunity, index) => {
      const opportunityId = this.idOf(opportunity._id);
      const optionNumber = index + 1;
      return [
        {
          command: `ask about ${optionNumber}`,
          label: `Ask about option ${optionNumber}`,
          opportunityId,
        },
        {
          command: `book option ${optionNumber}`,
          label: `Book option ${optionNumber}`,
          opportunityId,
        },
      ];
    });
  }

  private authorizeParticipant(opportunity: any, user: any) {
    const userId = this.idOf(user?._id);
    if (userId && userId === this.idOf(opportunity.sourcePublisherId)) {
      return this.participantSide(opportunity, "source");
    }
    if (userId && userId === this.idOf(opportunity.candidatePublisherId)) {
      return this.participantSide(opportunity, "candidate");
    }
    throw new ForbiddenException("Only opportunity participants can perform this action.");
  }

  private counterpartSide(opportunity: any, side: "source" | "candidate") {
    return this.participantSide(
      opportunity,
      side === "source" ? "candidate" : "source"
    );
  }

  private participantSide(opportunity: any, side: "source" | "candidate") {
    if (side === "source") {
      return {
        side,
        companyId: this.idOf(opportunity.sourceCompanyId) || this.idOf(opportunity.companyId),
        postId: this.idOf(opportunity.sourcePostId),
        postType: this.idOf(opportunity.sourcePostType),
        publisherId: this.idOf(opportunity.sourcePublisherId),
      };
    }

    return {
      side,
      companyId: this.idOf(opportunity.candidateCompanyId) || this.idOf(opportunity.companyId),
      postId: this.idOf(opportunity.candidatePostId),
      postType: this.idOf(opportunity.candidatePostType),
      publisherId: this.idOf(opportunity.candidatePublisherId),
    };
  }

  private roleForPostType(postType: string): "broker" | "carrier" {
    return postType === "carrierPost" ? "carrier" : "broker";
  }

  private samePostPairFilter(opportunity: any) {
    const sourcePostType = this.idOf(opportunity.sourcePostType);
    const sourcePostId = this.idOf(opportunity.sourcePostId);
    const candidatePostType = this.idOf(opportunity.candidatePostType);
    const candidatePostId = this.idOf(opportunity.candidatePostId);

    return {
      $or: [
        {
          sourcePostType,
          sourcePostId,
          candidatePostType,
          candidatePostId,
        },
        {
          sourcePostType: candidatePostType,
          sourcePostId: candidatePostId,
          candidatePostType: sourcePostType,
          candidatePostId: sourcePostId,
        },
      ],
    };
  }

  private broadcast(userId: string | undefined, event: any): void {
    if (!userId) {
      return;
    }
    this.gateway.broadcast(userId, {
      type: "matchingAssistantEvent",
      data: event,
    });
  }

  private optionalId(value: any): string | undefined {
    const id = this.idOf(value);
    return id || undefined;
  }

  private idOf(value: any): string {
    return String(value?.toString?.() ?? value ?? "").trim();
  }
}
