import { AgentCommandService } from "./agent-command.service";

describe("AgentCommandService", () => {
  const brokerPostModel: any = { find: jest.fn() };
  const carrierPostModel: any = { find: jest.fn() };
  const companyModel: any = { findById: jest.fn() };

  const chainFind = (model: any, results: any[]) => {
    const lean = jest.fn().mockResolvedValue(results);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    model.find.mockReturnValue({ sort });
    return { sort, limit, lean };
  };

  const createService = () =>
    new AgentCommandService(brokerPostModel, carrierPostModel, companyModel);

  beforeEach(() => {
    jest.clearAllMocks();
    companyModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
  });

  it("searches broker loads when the current user is a carrier", async () => {
    chainFind(brokerPostModel, [
      {
        _id: "load-1",
        company: "Brooke Broker",
        origin: { place: { city: "Memphis", state: "TN" } },
        destination: { place: { city: "Chicago", state: "IL" } },
        equipment: ["V"],
        weight: 42000,
        length: 53,
        capacity: "full",
        rate: 2500,
        publishedAt: new Date("2026-05-10T15:00:00.000Z"),
      },
    ]);

    const result = await createService().handlePrompt(
      "anything out of Memphis from the last 5 hours under 44000 pounds",
      { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
    );

    expect(brokerPostModel.find).toHaveBeenCalledWith(expect.objectContaining({
      companyId: { $ne: "carrier-company-1" },
      "origin.place.city": /^Memphis$/i,
      weight: { $lte: 44000 },
    }));
    expect(result.handled).toBe(true);
    expect(result.message).toContain("I found 1 hazmat load");
    expect(result.message).toContain("Memphis, TN to Chicago, IL");
    expect(result.metadata?.resultCount).toBe(1);
  });

  it("searches carrier trucks when the current user is a broker", async () => {
    chainFind(carrierPostModel, [
      {
        _id: "truck-1",
        company: "Casey Carrier",
        origin: { place: { city: "Houston", state: "TX" } },
        destination: { place: { city: "Memphis", state: "TN" } },
        equipment: ["V"],
        weight: 45000,
        length: 53,
        capacity: "partial",
        publishedAt: new Date("2026-05-10T15:00:00.000Z"),
      },
    ]);

    const result = await createService().handlePrompt(
      "show me only partial shipments out of Houston, TX under 30 feet",
      { _id: "broker-user-1", companyId: "broker-company-1", role: "broker" }
    );

    expect(carrierPostModel.find).toHaveBeenCalledWith(expect.objectContaining({
      companyId: { $ne: "broker-company-1" },
      "origin.place.city": /^Houston$/i,
      "origin.place.state": /^TX$/i,
      capacity: { $in: ["partial", "Partial", "PARTIAL"] },
      length: { $lte: 30 },
    }));
    expect(result.handled).toBe(true);
    expect(result.message).toContain("I found 1 hazmat truck");
  });

  it("returns map guidance for map-style prompts", async () => {
    chainFind(brokerPostModel, []);

    const result = await createService().handlePrompt(
      "show me a map with loads around my truck in Houston TX",
      { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
    );

    expect(result.handled).toBe(true);
    expect(result.metadata?.mapRequested).toBe(true);
    expect(result.message).toContain("map");
  });

  it("uses company type for owner/admin users", async () => {
    companyModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ type: "carrier" }),
    });
    chainFind(brokerPostModel, []);

    const result = await createService().handlePrompt(
      "anything out of Memphis from the last 5 hours",
      { _id: "owner-user-1", companyId: "carrier-company-1", role: "admin" }
    );

    expect(companyModel.findById).toHaveBeenCalledWith("carrier-company-1");
    expect(brokerPostModel.find).toHaveBeenCalled();
    expect(result.handled).toBe(true);
  });

  it("returns guidance when admin company type cannot be resolved", async () => {
    const result = await createService().handlePrompt(
      "anything out of Memphis from the last 5 hours",
      { _id: "owner-user-1", companyId: "company-1", role: "admin" }
    );

    expect(result.handled).toBe(true);
    expect(result.message).toContain("broker or carrier workspace");
    expect(brokerPostModel.find).not.toHaveBeenCalled();
    expect(carrierPostModel.find).not.toHaveBeenCalled();
  });

  it("does not handle existing booking commands", async () => {
    const result = await createService().handlePrompt(
      "book option 1",
      { _id: "carrier-user-1", companyId: "carrier-company-1", role: "carrier" }
    );

    expect(result).toEqual({ handled: false, message: "" });
    expect(brokerPostModel.find).not.toHaveBeenCalled();
    expect(carrierPostModel.find).not.toHaveBeenCalled();
  });
});
