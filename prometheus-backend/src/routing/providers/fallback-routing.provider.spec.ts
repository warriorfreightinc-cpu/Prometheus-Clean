import { FallbackRoutingProvider } from "./fallback-routing.provider";

describe("FallbackRoutingProvider", () => {
  it("geocodes common demo lane cities for local route intelligence", async () => {
    const provider = new FallbackRoutingProvider();

    await expect(provider.geocode("Chicago, IL")).resolves.toEqual(
      expect.objectContaining({ label: "Chicago, IL", lat: 41.8781, lng: -87.6298 })
    );
    await expect(provider.geocode("Memphis, TN")).resolves.toEqual(
      expect.objectContaining({ label: "Memphis, TN", lat: 35.1495, lng: -90.049 })
    );
    await expect(provider.geocode("Gary, IN")).resolves.toEqual(
      expect.objectContaining({ label: "Gary, IN", lat: 41.5934, lng: -87.3464 })
    );
  });

  it("returns fallback miles after geocoding common local route labels", async () => {
    const provider = new FallbackRoutingProvider();
    const origin = await provider.geocode("Chicago, IL");
    const destination = await provider.geocode("Memphis, TN");

    const report = await provider.getRouteReport({
      origin: origin!,
      destination: destination!,
      vehicleProfile: { equipment: ["VZ"], hazmat: true, weightLbs: 42000 },
    });

    expect(report).toEqual(
      expect.objectContaining({
        provider: "fallback-routing",
        source: "fallback",
        distanceMiles: expect.any(Number),
        driveMinutes: expect.any(Number),
      })
    );
    expect(report!.distanceMiles).toBeGreaterThan(450);
  });
});
