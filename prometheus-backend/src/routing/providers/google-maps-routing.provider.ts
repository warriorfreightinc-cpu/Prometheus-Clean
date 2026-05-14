import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import {
  RoutingGeocodeResult,
  RoutingProvider,
  RoutingRouteMatrixCell,
  RoutingRouteMatrixRequest,
  RoutingRouteReport,
  RoutingRouteReportRequest,
} from "../interfaces/routing-provider.interface";

const METERS_PER_MILE = 1609.344;

@Injectable()
export class GoogleMapsRoutingProvider implements RoutingProvider {
  readonly name = "google-maps-distance-matrix";

  constructor(private readonly configService: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async geocode(query: string): Promise<RoutingGeocodeResult | null> {
    const key = this.apiKey;
    const address = query?.trim();
    if (!key || !address) {
      return null;
    }

    const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: { address, key },
      timeout: 8000
    });
    const result = response?.data?.results?.[0];
    const location = result?.geometry?.location;
    if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
      return null;
    }

    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      label: address,
      formattedAddress: result.formatted_address ?? address
    };
  }

  async getRouteReport(request: RoutingRouteReportRequest): Promise<RoutingRouteReport | null> {
    const cells = await this.getRouteMatrix({
      origins: [request.origin],
      destinations: [request.destination],
      vehicleProfile: request.vehicleProfile
    });
    const cell = cells[0];
    if (!cell || cell.distanceMiles === null) {
      return null;
    }

    return {
      distanceMiles: cell.distanceMiles,
      driveMinutes: cell.driveMinutes,
      provider: this.name,
      source: "provider"
    };
  }

  async getRouteMatrix(request: RoutingRouteMatrixRequest): Promise<RoutingRouteMatrixCell[]> {
    const key = this.apiKey;
    if (!key || !request?.origins?.length || !request?.destinations?.length) {
      return [];
    }

    const response = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
      params: {
        origins: request.origins.map((location) => this.locationParam(location)).join("|"),
        destinations: request.destinations.map((location) => this.locationParam(location)).join("|"),
        units: "imperial",
        mode: "driving",
        key
      },
      timeout: 10000
    });

    const rows = Array.isArray(response?.data?.rows) ? response.data.rows : [];
    const cells: RoutingRouteMatrixCell[] = [];
    for (let originIndex = 0; originIndex < request.origins.length; originIndex += 1) {
      const elements = Array.isArray(rows[originIndex]?.elements) ? rows[originIndex].elements : [];
      for (let destinationIndex = 0; destinationIndex < request.destinations.length; destinationIndex += 1) {
        const element = elements[destinationIndex];
        cells.push({
          originIndex,
          destinationIndex,
          distanceMiles: this.metersToMiles(element?.status === "OK" ? element?.distance?.value : null),
          driveMinutes: this.secondsToMinutes(element?.status === "OK" ? element?.duration?.value : null)
        });
      }
    }
    return cells;
  }

  private get apiKey(): string {
    return (
      this.configService.get<string>("GOOGLE_MAPS_API_KEY") ||
      this.configService.get<string>("AgmCoreModule") ||
      ""
    ).trim();
  }

  private locationParam(location: { lat: number; lng: number; label?: string }): string {
    if (Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng))) {
      return `${Number(location.lat)},${Number(location.lng)}`;
    }
    return location?.label ?? "";
  }

  private metersToMiles(value: unknown): number | null {
    const meters = Number(value);
    if (!Number.isFinite(meters)) {
      return null;
    }
    return Math.round(meters / METERS_PER_MILE);
  }

  private secondsToMinutes(value: unknown): number | null {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
      return null;
    }
    return Math.round(seconds / 60);
  }
}
