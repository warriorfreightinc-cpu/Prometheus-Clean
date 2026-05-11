import { BrainEventService } from "./brain-event.service";

describe("BrainEventService", () => {
  const createService = (eventModel: any) => new BrainEventService(eventModel);

  it("records a prompt event with company and user context", async () => {
    const eventModel = {
      create: jest.fn().mockResolvedValue({ _id: "event-1" }),
    };

    await createService(eventModel).record({
      companyId: "company-1",
      userId: "user-1",
      role: "carrier",
      source: "matching",
      type: "promptReceived",
      prompt: "anything out of Memphis?",
    });

    expect(eventModel.create).toHaveBeenCalledWith({
      companyId: "company-1",
      userId: "user-1",
      role: "carrier",
      source: "matching",
      type: "promptReceived",
      prompt: "anything out of Memphis?",
    });
  });

  it("lists the newest events for one company", async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: "event-2" }, { _id: "event-1" }]);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    const eventModel = {
      find: jest.fn().mockReturnValue({ sort }),
    };

    const events = await createService(eventModel).listForCompany("company-1");

    expect(eventModel.find).toHaveBeenCalledWith({ companyId: "company-1" });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limit).toHaveBeenCalledWith(100);
    expect(events).toEqual([{ _id: "event-2" }, { _id: "event-1" }]);
  });
});
