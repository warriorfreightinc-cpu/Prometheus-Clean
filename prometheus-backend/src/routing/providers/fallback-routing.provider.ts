import { Injectable } from "@nestjs/common";
import {
  RoutingGeocodeResult,
  RoutingProvider,
  RoutingRouteMatrixCell,
  RoutingRouteMatrixRequest,
  RoutingRouteReport,
  RoutingRouteReportRequest,
} from "../interfaces/routing-provider.interface";

const EARTH_RADIUS_MILES = 3958.8;
const TRUCKING_STRETCH_FACTOR = 1.17;
const DEFAULT_TRUCK_SPEED_MPH = 47;
const FALLBACK_CITY_GEOCODES: Record<string, RoutingGeocodeResult> = {
  "baytown, tx": { label: "Baytown, TX", lat: 29.7355, lng: -94.9774 },
  "chicago, il": { label: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  "dallas, tx": { label: "Dallas, TX", lat: 32.7767, lng: -96.797 },
  "gary, in": { label: "Gary, IN", lat: 41.5934, lng: -87.3464 },
  "houston, tx": { label: "Houston, TX", lat: 29.7604, lng: -95.3698 },
  "memphis, tn": { label: "Memphis, TN", lat: 35.1495, lng: -90.049 },
  "nashville, tn": { label: "Nashville, TN", lat: 36.1627, lng: -86.7816 },
  "pasadena, tx": { label: "Pasadena, TX", lat: 29.6911, lng: -95.2091 },
};

@Injectable()
export class FallbackRoutingProvider implements RoutingProvider {
  readonly name = "fallback-routing";

  async geocode(query: string): Promise<RoutingGeocodeResult | null> {
    return FALLBACK_CITY_GEOCODES[this.normalizeCityQuery(query)] ?? null;
  }

  async getRouteReport(
    request: RoutingRouteReportRequest
  ): Promise<RoutingRouteReport | null> {
    const crowMiles = this.computeCrowMiles(request.origin, request.destination);
    if (crowMiles === null) {
      return null;
    }

    const distanceMiles = Math.max(Math.round(crowMiles * TRUCKING_STRETCH_FACTOR), 0);
    const driveMinutes = Math.max(
      Math.round((distanceMiles / DEFAULT_TRUCK_SPEED_MPH) * 60),
      0
    );

    return {
      distanceMiles,
      driveMinutes,
      provider: this.name,
      source: "fallback",
    };
  }

  async getRouteMatrix(
    request: RoutingRouteMatrixRequest
  ): Promise<RoutingRouteMatrixCell[]> {
    const cells: RoutingRouteMatrixCell[] = [];

    for (let originIndex = 0; originIndex < request.origins.length; originIndex += 1) {
      for (
        let destinationIndex = 0;
        destinationIndex < request.destinations.length;
        destinationIndex += 1
      ) {
        const report = await this.getRouteReport({
          origin: request.origins[originIndex],
          destination: request.destinations[destinationIndex],
          vehicleProfile: request.vehicleProfile,
        });

        cells.push({
          originIndex,
          destinationIndex,
          distanceMiles: report?.distanceMiles ?? null,
          driveMinutes: report?.driveMinutes ?? null,
        });
      }
    }

    return cells;
  }

  private computeCrowMiles(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): number | null {
    const originLat = Number(origin?.lat);
    const originLng = Number(origin?.lng);
    const destinationLat = Number(destination?.lat);
    const destinationLng = Number(destination?.lng);

    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLng) ||
      !Number.isFinite(destinationLat) ||
      !Number.isFinite(destinationLng)
    ) {
      return null;
    }

    if (originLat === destinationLat && originLng === destinationLng) {
      return 0;
    }

    const lat1 = this.toRadians(originLat);
    const lat2 = this.toRadians(destinationLat);
    const deltaLat = this.toRadians(destinationLat - originLat);
    const deltaLng = this.toRadians(destinationLng - originLng);

    const haversine =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

    const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return EARTH_RADIUS_MILES * arc;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private normalizeCityQuery(query: string): string {
    return String(query ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .toLowerCase();
  }
}
