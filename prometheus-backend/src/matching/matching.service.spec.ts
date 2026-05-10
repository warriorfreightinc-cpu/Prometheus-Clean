jest.mock("src/post-broker/post.service", () => ({ PostBrokerService: class {} }), { virtual: true });
jest.mock("src/post-carrier/post.service", () => ({ PostCarrierService: class {} }), { virtual: true });
jest.mock("src/routing/routing.service", () => ({ RoutingService: class {} }), { virtual: true });
jest.mock("./matching-assistant.service", () => ({
  MatchingAssistantService: class MatchingAssistantService {},
}));

import { MatchingService } from "./matching.service";

describe("MatchingService", () => {
  const createService = () => {
    const snapshotModel = {
      create: jest.fn().mockImplementation((document) => ({
        toObject: () => ({ ...document, _id: "snapshot-1" }),
      })),
      findOne: jest.fn(),
    };
    const opportunityModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
    };
    const brokerPostModel = { findById: jest.fn() };
    const carrierPostModel = { findById: jest.fn() };
    const brokerService = { search: jest.fn().mockResolvedValue([]) };
    const carrierService = { search: jest.fn().mockResolvedValue([]) };
    const routingService = {
      providerName: "test-routing",
      getRouteReport: jest.fn(),
    };
    const assistantService = {
      createSourceSuggestion: jest.fn().mockResolvedValue({}),
      createCounterpartSuggestions: jest.fn().mockResolvedValue([]),
    };

    const mockOpportunityList = (opportunities: any[]) => {
      const lean = jest.fn().mockResolvedValue(opportunities);
      const limit = jest.fn().mockReturnValue({ lean });
      const sort = jest.fn().mockReturnValue({ limit });
      opportunityModel.find.mockReturnValue({ sort });
      return { sort, limit, lean };
    };

    const service = new MatchingService(
      snapshotModel as any,
      opportunityModel as any,
      brokerPostModel as any,
      carrierPostModel as any,
      brokerService as any,
      carrierService as any,
      routingService as any,
      assistantService as any
    );

    return {
      service,
      snapshotModel,
      opportunityModel,
      brokerPostModel,
      carrierPostModel,
      brokerService,
      carrierService,
      assistantService,
      mockOpportunityList,
    };
  };

  it("normalizes saved carrier posts before searching broker matches", async () => {
    const { service, carrierPostModel, brokerService } = createService();
    const savedCarrierPost = {
      _id: "carrier-post-1",
      companyId: "carrier-company-1",
      publisherId: "carrier-user-1",
      capacity: "full",
      capacitySearch: "both",
      length: 53,
      weight: 45000,
      equipment: ["V"],
      startDate: new Date("2026-04-29T00:00:00.000Z"),
      endDate: new Date("2026-04-29T23:59:59.999Z"),
      origin: {
        type: "place",
        place: { city: "Chicago", state: "IL" },
        location: { type: "Point", coordinates: { lat: 41.8755616, lng: -87.6244212 } },
      },
      dhoRadius: 50,
    };
    carrierPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(savedCarrierPost),
    });

    await service.createSnapshotForCarrierPost("carrier-post-1", "carrier-user-1");

    const searchPayload = brokerService.search.mock.calls[0][0];
    expect(searchPayload).not.toBe(savedCarrierPost);
    expect(searchPayload.startDate).toBe("2026-04-29T00:00:00.000Z");
    expect(searchPayload.endDate).toBe("2026-04-29T23:59:59.999Z");
    expect(searchPayload.origin.location.coordinates).toEqual({
      lat: 41.8755616,
      lng: -87.6244212,
    });
  });

  it("adds hazmat tier metadata to snapshot candidates", async () => {
    const { service, carrierPostModel, brokerService } = createService();
    carrierPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "carrier-post-1",
        companyId: "carrier-company-1",
        publisherId: "carrier-user-1",
        weight: 44000,
        equipment: ["RZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      }),
    });
    brokerService.search.mockResolvedValue([
      {
        _id: "broker-post-1",
        companyId: "broker-company-1",
        publisherId: "broker-user-1",
        weight: 40000,
        rate: 2800,
        equipment: ["VZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      },
    ]);

    const snapshot = await service.createSnapshotForCarrierPost("carrier-post-1", "carrier-user-1");

    expect(snapshot.candidates[0].tier).toBe("hazmatPermission");
    expect(snapshot.candidates[0].equipmentCompatibility).toBe("requiresPermission");
    expect(snapshot.candidates[0].permissionQuestion).toContain("reefer hazmat");
  });

  it("does not reset opportunity lifecycle state when refreshing matches", async () => {
    const { service, carrierPostModel, brokerService, opportunityModel } = createService();
    carrierPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "carrier-post-1",
        companyId: "carrier-company-1",
        publisherId: "carrier-user-1",
        weight: 44000,
        equipment: ["RZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      }),
    });
    brokerService.search.mockResolvedValue([
      {
        _id: "broker-post-1",
        companyId: "broker-company-1",
        publisherId: "broker-user-1",
        weight: 40000,
        rate: 2800,
        equipment: ["VZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      },
    ]);

    await service.createSnapshotForCarrierPost("carrier-post-1", "carrier-user-1");

    const update = opportunityModel.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.status).toBeUndefined();
    expect(update.$set.permissionStatus).toBeUndefined();
    expect(update.$setOnInsert.status).toBe("suggested");
    expect(update.$setOnInsert.permissionStatus).toBe("notAsked");
  });

  it("persists source and candidate company ids on opportunities", async () => {
    const { service, carrierPostModel, brokerService, opportunityModel } = createService();
    carrierPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "carrier-post-1",
        companyId: "carrier-company-1",
        publisherId: "carrier-user-1",
        weight: 44000,
        equipment: ["RZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      }),
    });
    brokerService.search.mockResolvedValue([
      {
        _id: "broker-post-1",
        companyId: "broker-company-1",
        publisherId: "broker-user-1",
        weight: 40000,
        rate: 2800,
        equipment: ["VZ"],
        origin: { type: "place", place: { city: "Pittsburgh", state: "PA" } },
        destination: { type: "place", place: { city: "Chicago", state: "IL" } },
      },
    ]);

    await service.createSnapshotForCarrierPost("carrier-post-1", "carrier-user-1");

    const update = opportunityModel.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.sourceCompanyId).toBe("carrier-company-1");
    expect(update.$set.candidateCompanyId).toBe("broker-company-1");
  });

  it("creates an assistant suggestion for a broker post snapshot", async () => {
    const { service, assistantService, mockOpportunityList } = createService();
    const snapshot = {
      companyId: "broker-company-1",
      sourcePostId: "broker-post-1",
    } as any;
    const opportunities = [
      {
        _id: "opp-1",
        sourcePostId: "broker-post-1",
        candidatePostId: "carrier-post-1",
      },
    ];
    mockOpportunityList(opportunities);
    jest
      .spyOn(service, "createSnapshotForBrokerPost")
      .mockResolvedValue(snapshot);

    const result = await service.createAssistantSuggestionForPost(
      "brokerPost",
      "broker-post-1",
      "broker-user-1"
    );

    expect(service.createSnapshotForBrokerPost).toHaveBeenCalledWith(
      "broker-post-1",
      "broker-user-1"
    );
    expect(assistantService.createSourceSuggestion).toHaveBeenCalledWith(
      "broker-company-1",
      "broker-user-1",
      "broker-post-1"
    );
    expect(assistantService.createCounterpartSuggestions).toHaveBeenCalledWith(opportunities);
    expect(result).toBe(snapshot);
  });

  it("creates an assistant suggestion for a carrier post snapshot", async () => {
    const { service, assistantService, mockOpportunityList } = createService();
    const snapshot = {
      companyId: "carrier-company-1",
      sourcePostId: "carrier-post-1",
    } as any;
    const opportunities = [
      {
        _id: "opp-1",
        sourcePostId: "carrier-post-1",
        candidatePostId: "broker-post-1",
      },
    ];
    mockOpportunityList(opportunities);
    jest
      .spyOn(service, "createSnapshotForCarrierPost")
      .mockResolvedValue(snapshot);

    const result = await service.createAssistantSuggestionForPost(
      "carrierPost",
      "carrier-post-1",
      "carrier-user-1"
    );

    expect(service.createSnapshotForCarrierPost).toHaveBeenCalledWith(
      "carrier-post-1",
      "carrier-user-1"
    );
    expect(assistantService.createSourceSuggestion).toHaveBeenCalledWith(
      "carrier-company-1",
      "carrier-user-1",
      "carrier-post-1"
    );
    expect(assistantService.createCounterpartSuggestions).toHaveBeenCalledWith(opportunities);
    expect(result).toBe(snapshot);
  });
});
