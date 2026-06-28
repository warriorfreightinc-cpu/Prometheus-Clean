import { PostBrokerService } from "./post.service";

describe("PostBrokerService", () => {
  it("returns no origin-only matches when search data is missing origin coordinates", async () => {
    const aggregate = jest.fn().mockResolvedValue([]);
    const service = new PostBrokerService(
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

    await expect(
      service.doSearchOrigineOnly(
        {
          equipment: ["V", "VZ"],
          length: 53,
          weight: 45000,
          dhoRadius: 50,
        },
        ["full", "Full", "FULL"],
        "user-1",
        { start: null, end: null },
      )
    ).resolves.toEqual([]);

    expect(aggregate).not.toHaveBeenCalled();
  });
});
