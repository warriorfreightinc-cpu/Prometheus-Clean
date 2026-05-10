jest.mock("src/gateway/app.gateway", () => ({ AppGateway: class {} }), { virtual: true });
jest.mock("src/messages/messages.service", () => ({ MessagesService: class {} }), { virtual: true });

import { ForbiddenException } from "@nestjs/common";
import { MatchingAssistantService } from "./matching-assistant.service";

describe("MatchingAssistantService", () => {
  const opportunityModel: any = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const eventModel: any = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const messagesService: any = {
    createRoom: jest.fn(),
  };
  const gateway: any = {
    broadcast: jest.fn(),
  };
  const agentCommandService: any = {
    handlePrompt: jest.fn(),
  };

  const createService = () =>
    new MatchingAssistantService(
      opportunityModel,
      eventModel,
      messagesService,
      gateway,
      agentCommandService
    );

  const mockOpportunityList = (opportunities: any[]) => {
    const lean = jest.fn().mockResolvedValue(opportunities);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    opportunityModel.find.mockReturnValue({ sort });
    return { sort, limit, lean };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    agentCommandService.handlePrompt.mockResolvedValue({ handled: false, message: "" });
    eventModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
  });

  const brokerSourceOpportunity = {
    _id: "opp-1",
    companyId: "broker-company-1",
    sourceCompanyId: "broker-company-1",
    candidateCompanyId: "carrier-company-1",
    sourcePostType: "brokerPost",
    sourcePostId: "broker-post-1",
    candidatePostType: "carrierPost",
    candidatePostId: "carrier-post-1",
    sourcePublisherId: "broker-user-1",
    candidatePublisherId: "carrier-user-1",
    permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
  };

  it("lists direct user events without leaking other company targeted events", async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: "event-2", userId: "broker-user-1", companyId: "broker-company-1" },
      { _id: "event-1", companyId: "broker-company-1" },
    ]);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    eventModel.find.mockReturnValue({ sort });

    const events = await createService().listEvents({
      _id: "broker-user-1",
      companyId: "broker-company-1",
      role: "broker",
    });

    expect(eventModel.find).toHaveBeenCalledWith({
      $or: [
        { userId: "broker-user-1" },
        {
          companyId: "broker-company-1",
          $and: [
            { $or: [{ userId: "" }, { userId: { $exists: false } }] },
            { $or: [{ targetRole: "" }, { targetRole: { $exists: false } }, { targetRole: "broker" }] },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { _id: "event-1", companyId: "broker-company-1" },
      { _id: "event-2", userId: "broker-user-1", companyId: "broker-company-1" },
    ]);
  });

  it("does not list role-scoped carrier events for broker users after reload", async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    eventModel.find.mockReturnValue({ sort });

    await createService().listEvents({
      _id: "broker-user-1",
      companyId: "shared-company-1",
      role: "broker",
    });

    expect(eventModel.find).toHaveBeenCalledWith({
      $or: [
        { userId: "broker-user-1" },
        {
          companyId: "shared-company-1",
          $and: [
            { $or: [{ userId: "" }, { userId: { $exists: false } }] },
            { $or: [{ targetRole: "" }, { targetRole: { $exists: false } }, { targetRole: "broker" }] },
          ],
        },
      ],
    });
  });

  it("creates a first suggestion message from ranked opportunities", async () => {
    mockOpportunityList([
      {
        _id: "opp-1",
        sourcePostId: "truck-1",
        candidatePostId: "load-1",
        tier: "hazmatPermission",
        score: 0.88,
        permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
      },
    ]);
    eventModel.create.mockImplementation(async (event) => ({
      ...event,
      _id: "event-1",
    }));

    const event = await createService().createSourceSuggestion(
      "carrier-company-1",
      "carrier-user-1",
      "truck-1"
    );

    expect(opportunityModel.find).toHaveBeenCalledWith({
      companyId: "carrier-company-1",
      sourcePostId: "truck-1",
      status: { $in: ["suggested", "negotiating"] },
    });
    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "carrier-company-1",
      userId: "carrier-user-1",
      role: "assistant",
      relatedOpportunityId: "opp-1",
      sourcePostId: "truck-1",
    }));
    expect(event.message).toContain("No exact");
    expect(event.availableCommands).toEqual([
      { command: "ask about 1", label: "Ask about option 1", opportunityId: "opp-1" },
      { command: "book option 1", label: "Book option 1", opportunityId: "opp-1" },
    ]);
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "carrier-user-1",
      { type: "matchingAssistantEvent", data: event }
    );
  });

  it("notifies a matched counterpart publisher when a new source post creates an opportunity", async () => {
    eventModel.create.mockImplementation(async (event) => ({
      ...event,
      _id: "counterpart-event-1",
    }));

    const events = await createService().createCounterpartSuggestions([
      {
        _id: "opp-1",
        sourcePostType: "brokerPost",
        sourcePostId: "broker-post-1",
        sourceCompanyId: "broker-company-1",
        sourcePublisherId: "broker-user-1",
        candidatePostType: "carrierPost",
        candidatePostId: "carrier-post-1",
        candidateCompanyId: "carrier-company-1",
        candidatePublisherId: "carrier-user-1",
        tier: "strictHazmat",
        permissionQuestion: "",
      },
    ]);

    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "carrier-company-1",
      userId: "carrier-user-1",
      targetRole: "carrier",
      dedupeKey: "counterpart:opp-1:carrier-post-1",
      role: "assistant",
      sourcePostId: "carrier-post-1",
      relatedOpportunityId: "opp-1",
      message: expect.stringContaining("matching hazmat load"),
      availableCommands: expect.arrayContaining([
        { command: "show matches", label: "Show matches" },
      ]),
    }));
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "carrier-user-1",
      { type: "matchingAssistantEvent", data: events[0] }
    );
  });

  it("falls back to the counterpart company role room when no publisher is known", async () => {
    eventModel.create.mockImplementation(async (event) => ({
      ...event,
      _id: "counterpart-event-1",
    }));

    await createService().createCounterpartSuggestions([
      {
        _id: "opp-1",
        sourcePostType: "carrierPost",
        sourcePostId: "carrier-post-1",
        sourceCompanyId: "carrier-company-1",
        sourcePublisherId: "carrier-user-1",
        candidatePostType: "brokerPost",
        candidatePostId: "broker-post-1",
        candidateCompanyId: "broker-company-1",
        candidatePublisherId: "",
        tier: "hazmatPermission",
        permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
      },
    ]);

    const eventPayload = eventModel.create.mock.calls[0][0];
    expect(eventPayload.userId).toBeUndefined();
    expect(eventPayload.targetRole).toBe("broker");
    expect(eventPayload.message).toContain("matching hazmat truck");
    expect(eventPayload.message).toContain("Can this van hazmat load move safely");
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "broker-company-1_broker",
      expect.objectContaining({ type: "matchingAssistantEvent" })
    );
  });

  it("does not recreate or rebroadcast duplicate counterpart suggestions", async () => {
    eventModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: "existing-event-1" }),
    });

    const events = await createService().createCounterpartSuggestions([
      {
        _id: "opp-1",
        sourcePostType: "brokerPost",
        sourcePostId: "broker-post-1",
        sourceCompanyId: "broker-company-1",
        sourcePublisherId: "broker-user-1",
        candidatePostType: "carrierPost",
        candidatePostId: "carrier-post-1",
        candidateCompanyId: "carrier-company-1",
        candidatePublisherId: "carrier-user-1",
      },
    ]);

    expect(eventModel.findOne).toHaveBeenCalledWith({
      dedupeKey: "counterpart:opp-1:carrier-post-1",
    });
    expect(eventModel.create).not.toHaveBeenCalled();
    expect(gateway.broadcast).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("asks the counterpart when the user chooses a permission opportunity", async () => {
    opportunityModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "opp-1",
        companyId: "carrier-company-1",
        sourcePostType: "carrierPost",
        sourcePostId: "truck-1",
        candidatePostType: "brokerPost",
        candidatePostId: "load-1",
        sourceCompanyId: "carrier-company-1",
        candidateCompanyId: "broker-company-1",
        sourcePublisherId: "carrier-user-1",
        candidatePublisherId: "broker-user-1",
        permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
      }),
    });
    opportunityModel.findByIdAndUpdate.mockResolvedValue({});
    eventModel.create.mockImplementation(async (event) => ({
      ...event,
      _id: event.userId === "broker-user-1" ? "counterpart-event" : "local-event",
    }));

    const event = await createService().askCounterpart("opp-1", {
      _id: "carrier-user-1",
      role: "carrier",
      companyId: "carrier-company-1",
    });

    expect(opportunityModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "opp-1",
      { $set: { permissionStatus: "asked", status: "negotiating" } },
      { new: true }
    );
    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "broker-company-1",
      userId: "broker-user-1",
      role: "assistant",
      message: "Can this van hazmat load move safely on reefer hazmat equipment?",
      relatedOpportunityId: "opp-1",
    }));
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "broker-user-1",
      expect.objectContaining({ type: "matchingAssistantEvent" })
    );
    expect(event.userId).toBe("broker-user-1");
  });

  it.each(["ask", "accept", "reject", "book"] as const)(
    "rejects unauthorized users trying to %s an opportunity",
    async (action) => {
      opportunityModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(brokerSourceOpportunity),
      });

      await expect(
        createService().handleAction(
          "opp-1",
          action,
          { _id: "other-user-1", role: "carrier", companyId: "other-company-1" }
        )
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(opportunityModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(messagesService.createRoom).not.toHaveBeenCalled();
      expect(eventModel.create).not.toHaveBeenCalled();
    }
  );

  it("uses command indexes to ask about the first ranked opportunity", async () => {
    mockOpportunityList([
      {
        _id: "opp-1",
        companyId: "carrier-company-1",
        sourcePostId: "truck-1",
        sourcePublisherId: "carrier-user-1",
        candidatePublisherId: "broker-user-1",
        candidatePostId: "load-1",
        permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
      },
    ]);
    opportunityModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "opp-1",
        companyId: "carrier-company-1",
        sourcePostId: "truck-1",
        candidatePostId: "load-1",
        sourcePublisherId: "carrier-user-1",
        candidatePublisherId: "broker-user-1",
        permissionQuestion: "Can this van hazmat load move safely on reefer hazmat equipment?",
      }),
    });
    opportunityModel.findByIdAndUpdate.mockResolvedValue({});
    eventModel.create.mockImplementation(async (event) => ({ ...event, _id: "event-1" }));

    await createService().handleCommand(
      { prompt: "ask about 1", sourcePostId: "truck-1" },
      { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
    );

    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      role: "user",
      message: "ask about 1",
    }));
    expect(opportunityModel.find).toHaveBeenCalledWith({
      companyId: "carrier-company-1",
      sourcePostId: "truck-1",
      status: { $in: ["suggested", "negotiating"] },
    });
    expect(opportunityModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "opp-1",
      { $set: { permissionStatus: "asked", status: "negotiating" } },
      { new: true }
    );
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "broker-user-1",
      expect.objectContaining({ type: "matchingAssistantEvent" })
    );
  });

  it("routes broad search prompts to the agent command service", async () => {
    agentCommandService.handlePrompt.mockResolvedValue({
      handled: true,
      message: "I found 3 hazmat loads out of Memphis from the last 5 hours.",
      metadata: { commandType: "search" },
    });
    eventModel.create.mockImplementation(async (event) => ({ ...event, _id: "event-1" }));

    const result: any = await createService().handleCommand(
      { prompt: "anything out of Memphis from the last 5 hours", sourcePostId: "" },
      { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
    );

    expect(agentCommandService.handlePrompt).toHaveBeenCalledWith(
      "anything out of Memphis from the last 5 hours",
      { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
    );
    expect(result.message).toContain("3 hazmat loads");
    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      role: "assistant",
      message: "I found 3 hazmat loads out of Memphis from the last 5 hours.",
    }));
  });

  it("creates booking rooms with role-correct broker and carrier posts", async () => {
    opportunityModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(brokerSourceOpportunity),
    });
    opportunityModel.findByIdAndUpdate.mockResolvedValue({});
    messagesService.createRoom.mockResolvedValue({ created: true, room: { _id: "room-1" } });
    eventModel.create.mockImplementation(async (event) => ({ ...event, _id: `event-${event.userId}` }));

    const result = await createService().handleAction(
      "opp-1",
      "book",
      { _id: "carrier-user-1", role: "carrier", companyId: "carrier-company-1" }
    );

    expect(messagesService.createRoom).toHaveBeenCalledWith(
      {
        myPostId: "carrier-post-1",
        otherPostId: "broker-post-1",
        otherUserId: "broker-user-1",
      },
      "carrier-user-1",
      "carrier"
    );
    expect(opportunityModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "opp-1",
      { $set: { status: "approvedForBooking" } },
      { new: true }
    );
    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "carrier-company-1",
      userId: "carrier-user-1",
      message: "Booking chat is ready. Open Booking Chat to continue approval.",
      relatedOpportunityId: "opp-1",
    }));
    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "broker-company-1",
      userId: "broker-user-1",
      message: "Booking chat is ready for this hazmat match.",
      relatedOpportunityId: "opp-1",
    }));
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "carrier-user-1",
      expect.objectContaining({ type: "matchingAssistantEvent" })
    );
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "broker-user-1",
      expect.objectContaining({ type: "matchingAssistantEvent" })
    );
    expect(result).toEqual({ created: true, room: { _id: "room-1" } });
  });

  it("derives booking role from the authorized participant side, not the request role", async () => {
    opportunityModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(brokerSourceOpportunity),
    });
    opportunityModel.findByIdAndUpdate.mockResolvedValue({});
    messagesService.createRoom.mockResolvedValue({ created: true, room: { _id: "room-1" } });
    eventModel.create.mockImplementation(async (event) => ({ ...event, _id: `event-${event.userId}` }));

    await createService().handleAction(
      "opp-1",
      "book",
      { _id: "broker-user-1", role: "carrier", companyId: "broker-company-1" }
    );

    expect(messagesService.createRoom).toHaveBeenCalledWith(
      {
        myPostId: "broker-post-1",
        otherPostId: "carrier-post-1",
        otherUserId: "carrier-user-1",
      },
      "broker-user-1",
      "broker"
    );
  });

  it("notifies the counterpart when an opportunity is rejected", async () => {
    opportunityModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(brokerSourceOpportunity),
    });
    opportunityModel.findByIdAndUpdate.mockResolvedValue({});
    eventModel.create.mockImplementation(async (event) => ({ ...event, _id: `event-${event.userId}` }));

    await createService().handleAction(
      "opp-1",
      "reject",
      { _id: "carrier-user-1", role: "carrier", companyId: "carrier-company-1" }
    );

    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "broker-company-1",
      userId: "broker-user-1",
      message: "The counterpart rejected this hazmat match option.",
      relatedOpportunityId: "opp-1",
    }));
    expect(gateway.broadcast).toHaveBeenCalledWith(
      "broker-user-1",
      expect.objectContaining({ type: "matchingAssistantEvent" })
    );
  });
});
