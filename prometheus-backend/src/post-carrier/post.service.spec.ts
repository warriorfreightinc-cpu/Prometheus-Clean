import { PostCarrierService } from "./post.service";

describe("PostCarrierService", () => {
  it("uses date overlap without forcing carrier startDate inside the broker pickup window", async () => {
    const aggregate = jest.fn().mockResolvedValue([]);
    const service = new PostCarrierService(
      { aggregate } as any,
      {} as any,
      { findById: jest.fn().mockResolvedValue({ blacklist: [] }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    const pickupWindow = {
      start: new Date("2026-05-10T20:59:24.364Z"),
      end: new Date("2026-05-10T20:59:24.364Z"),
    };
    service.buildSearchWindow = jest.fn().mockResolvedValue(pickupWindow);
    service.buildDateOverlapExpr = jest.fn().mockReturnValue({
      $and: [
        { $lte: [{ $toDate: "$startDate" }, pickupWindow.end] },
        {
          $gte: [
            { $toDate: { $ifNull: ["$endDate", "$startDate"] } },
            pickupWindow.start,
          ],
        },
      ],
    });

    await service.doSearchOrineDestination(
      {
        equipment: ["V", "VZ"],
        length: 53,
        weight: 42000,
        dhoRadius: 50,
        dhdRadius: 50,
        origin: {
          location: { coordinates: { lat: 41.8781, lng: -87.6298 } },
        },
        destination: {
          place: { state: "TN" },
          location: { coordinates: { lat: 35.1495, lng: -90.049 } },
        },
      },
      ["full", "Full", "FULL"],
      "user-1",
    );

    const pipeline = aggregate.mock.calls[0][0];
    const matchStage = pipeline.find((stage: any) => stage.$match).$match;

    expect(matchStage.$expr).toBeDefined();
    expect(matchStage.startDate).toBeUndefined();
  });
});
