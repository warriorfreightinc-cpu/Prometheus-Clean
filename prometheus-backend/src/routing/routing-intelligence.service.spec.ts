import { RoutingIntelligenceService } from "./routing-intelligence.service";

describe("RoutingIntelligenceService", () => {
  const routingService = {
    providerName: "fallback-routing",
    geocode: jest.fn(),
    getRouteReport: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routingService.getRouteReport.mockImplementation(({ origin, destination }) => {
      if (origin.label === "Gary, IN" && destination.label === "Chicago, IL") {
        return Promise.resolve({
          distanceMiles: 31,
          driveMinutes: 45,
          provider: "fallback-routing",
          source: "fallback"
        });
      }
      if (origin.label === "Chicago, IL" && destination.label === "Memphis, TN") {
        return Promise.resolve({
          distanceMiles: 532,
          driveMinutes: 680,
          provider: "fallback-routing",
          source: "fallback"
        });
      }
      return Promise.resolve(null);
    });
  });

  it("builds route intelligence from truck, pickup, and delivery coordinates", async () => {
    const result = await new RoutingIntelligenceService(routingService as any).buildRouteIntelligence({
      truckLocation: { label: "Gary, IN", lat: 41.5934, lng: -87.3464 },
      origin: { label: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
      destination: { label: "Memphis, TN", lat: 35.1495, lng: -90.049 },
      equipment: ["VZ"],
      weightLbs: 42000,
      postedRate: 2500
    });

    expect(result).toEqual(
      expect.objectContaining({
        routeProvider: "fallback-routing",
        providerStatus: "fallback",
        truckLocationLabel: "Gary, IN",
        originLabel: "Chicago, IL",
        destinationLabel: "Memphis, TN",
        deadheadMiles: 31,
        loadedMiles: 532,
        totalMiles: 563,
        loadedDriveMinutes: 680,
        ratePerLoadedMile: 4.7,
        tollEstimate: null,
        fuelEstimate: null
      })
    );
    expect(result.hazmatNotes.join(" ")).toContain("Hazmat route restrictions are advisory");
    expect(result.hazmatNotes.join(" ")).toContain("Fuel and toll estimates require");
  });

  it("returns honest unavailable fields when coordinates and geocoding are missing", async () => {
    routingService.geocode.mockResolvedValue(null);

    const result = await new RoutingIntelligenceService(routingService as any).buildRouteIntelligence({
      origin: { label: "Houston, TX" },
      destination: { label: "Memphis, TN" }
    });

    expect(result.providerStatus).toBe("unavailable");
    expect(result.loadedMiles).toBeNull();
    expect(result.totalMiles).toBeNull();
    expect(result.providerWarnings).toContain("Origin coordinates are missing.");
    expect(result.providerWarnings).toContain("Destination coordinates are missing.");
  });
});
