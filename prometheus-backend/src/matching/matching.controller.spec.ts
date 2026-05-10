import { BadRequestException } from "@nestjs/common";

jest.mock("./matching.service", () => ({
  MatchingService: class MatchingService {},
}));
jest.mock("./matching-assistant.service", () => ({
  MatchingAssistantService: class MatchingAssistantService {},
}));

import { MatchingController } from "./matching.controller";

describe("MatchingController", () => {
  const service: any = {
    createSnapshotForBrokerPost: jest.fn(),
    createSnapshotForCarrierPost: jest.fn(),
    getLatestSnapshot: jest.fn(),
  };
  const assistant: any = {
    listEvents: jest.fn(),
    handleCommand: jest.fn(),
    handleAction: jest.fn(),
  };

  function controller() {
    return new MatchingController(service, assistant);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a broker-post snapshot for the signed-in user", async () => {
    service.createSnapshotForBrokerPost.mockResolvedValue({
      sourcePostId: "broker-1",
      candidateCount: 2,
    });

    const result = await controller().createSnapshot(
      { sourcePostType: "brokerPost", sourcePostId: "broker-1" },
      { user: { _id: "user-1" } }
    );

    expect(service.createSnapshotForBrokerPost).toHaveBeenCalledWith(
      "broker-1",
      "user-1"
    );
    expect(result).toEqual({ sourcePostId: "broker-1", candidateCount: 2 });
  });

  it("creates a carrier-post snapshot for the signed-in user", async () => {
    service.createSnapshotForCarrierPost.mockResolvedValue({
      sourcePostId: "carrier-1",
      candidateCount: 3,
    });

    const result = await controller().createSnapshot(
      { sourcePostType: "carrierPost", sourcePostId: "carrier-1" },
      { user: { _id: "user-2" } }
    );

    expect(service.createSnapshotForCarrierPost).toHaveBeenCalledWith(
      "carrier-1",
      "user-2"
    );
    expect(result).toEqual({ sourcePostId: "carrier-1", candidateCount: 3 });
  });

  it("rejects an unknown source post type", async () => {
    await expect(
      controller().createSnapshot(
        { sourcePostType: "unknown" as any, sourcePostId: "post-1" },
        { user: { _id: "user-1" } }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("gets the latest snapshot by source type and post id", async () => {
    service.getLatestSnapshot.mockResolvedValue({
      sourcePostId: "broker-1",
      candidateCount: 1,
    });

    const result = await controller().getLatest("brokerPost", "broker-1");

    expect(service.getLatestSnapshot).toHaveBeenCalledWith(
      "brokerPost",
      "broker-1"
    );
    expect(result).toEqual({ sourcePostId: "broker-1", candidateCount: 1 });
  });

  it("lists assistant events for the signed-in user", async () => {
    assistant.listEvents.mockResolvedValue([{ message: "Hazmat Hero is watching." }]);

    const result = await controller().listAssistantEvents({
      user: { _id: "user-1", companyId: "company-1" },
    });

    expect(assistant.listEvents).toHaveBeenCalledWith({
      _id: "user-1",
      companyId: "company-1",
    });
    expect(result).toEqual([{ message: "Hazmat Hero is watching." }]);
  });

  it("sends assistant commands for the signed-in user", async () => {
    assistant.handleCommand.mockResolvedValue({ message: "I asked the broker." });

    const result = await controller().handleAssistantCommand(
      { prompt: "ask about 1", sourcePostId: "truck-1" },
      { user: { _id: "user-1", companyId: "company-1" } }
    );

    expect(assistant.handleCommand).toHaveBeenCalledWith(
      { prompt: "ask about 1", sourcePostId: "truck-1" },
      { _id: "user-1", companyId: "company-1" }
    );
    expect(result).toEqual({ message: "I asked the broker." });
  });

  it("routes opportunity actions through the assistant service", async () => {
    assistant.handleAction.mockResolvedValue({ message: "Booked." });

    const result = await controller().handleOpportunityAction(
      "opp-1",
      { action: "book" },
      { user: { _id: "user-1", companyId: "company-1" } }
    );

    expect(assistant.handleAction).toHaveBeenCalledWith(
      "opp-1",
      "book",
      { _id: "user-1", companyId: "company-1" }
    );
    expect(result).toEqual({ message: "Booked." });
  });
});
