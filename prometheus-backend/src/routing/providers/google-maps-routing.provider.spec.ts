import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { GoogleMapsRoutingProvider } from "./google-maps-routing.provider";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("GoogleMapsRoutingProvider", () => {
  const configService = {
    get: jest.fn()
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === "GOOGLE_MAPS_API_KEY") return "google-key";
      return "";
    });
  });

  it("geocodes a city through Google when a key is configured", async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        status: "OK",
        results: [
          {
            formatted_address: "Chicago, IL, USA",
            geometry: { location: { lat: 41.8781, lng: -87.6298 } }
          }
        ]
      }
    });

    const result = await new GoogleMapsRoutingProvider(configService).geocode("Chicago, IL");

    expect(result).toEqual({
      lat: 41.8781,
      lng: -87.6298,
      label: "Chicago, IL",
      formattedAddress: "Chicago, IL, USA"
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://maps.googleapis.com/maps/api/geocode/json",
      expect.objectContaining({
        params: expect.objectContaining({ address: "Chicago, IL", key: "google-key" })
      })
    );
  });

  it("returns route miles and drive time from Google Distance Matrix", async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        status: "OK",
        rows: [
          {
            elements: [
              {
                status: "OK",
                distance: { value: 160934 },
                duration: { value: 7200 }
              }
            ]
          }
        ]
      }
    });

    const report = await new GoogleMapsRoutingProvider(configService).getRouteReport({
      origin: { lat: 41.8781, lng: -87.6298, label: "Chicago, IL" },
      destination: { lat: 35.1495, lng: -90.049, label: "Memphis, TN" }
    });

    expect(report).toEqual({
      distanceMiles: 100,
      driveMinutes: 120,
      provider: "google-maps-distance-matrix",
      source: "provider"
    });
  });

  it("does not call Google when no key is configured", async () => {
    (configService.get as jest.Mock).mockReturnValue("");

    const provider = new GoogleMapsRoutingProvider(configService);

    await expect(provider.geocode("Chicago, IL")).resolves.toBeNull();
    await expect(provider.getRouteReport({
      origin: { lat: 41.8781, lng: -87.6298 },
      destination: { lat: 35.1495, lng: -90.049 }
    })).resolves.toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
