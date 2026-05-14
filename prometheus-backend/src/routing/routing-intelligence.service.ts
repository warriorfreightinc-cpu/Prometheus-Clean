import { Injectable } from "@nestjs/common";
import { RoutingLocation, RoutingRouteReport } from "./interfaces/routing-provider.interface";
import { RoutingService } from "./routing.service";
import {
  RoutingInputLocation,
  RoutingIntelligenceProviderStatus,
  RoutingIntelligenceRequestDTO,
  RoutingIntelligenceResponseDTO,
} from "./dto/routing-intelligence.dto";

@Injectable()
export class RoutingIntelligenceService {
  constructor(private readonly routingService: RoutingService) {}

  async buildRouteIntelligence(request: RoutingIntelligenceRequestDTO): Promise<RoutingIntelligenceResponseDTO> {
    const warnings: string[] = [];
    const origin = await this.resolveLocation(request.origin, "Origin", warnings);
    const destination = await this.resolveLocation(request.destination, "Destination", warnings);
    const truckLocation = await this.resolveLocation(request.truckLocation, "Truck location", warnings);
    const stops = await Promise.all((request.stops ?? []).map((stop, index) => this.resolveLocation(stop, `Stop ${index + 1}`, warnings)));
    const resolvedStops = stops.filter((stop): stop is RoutingLocation => Boolean(stop));

    const loadedReport = origin && destination
      ? await this.getLoadedRoute(origin, destination, resolvedStops, request)
      : null;
    const deadheadReport = truckLocation && origin
      ? await this.routingService.getRouteReport({
          origin: truckLocation,
          destination: origin,
          vehicleProfile: this.vehicleProfile(request)
        })
      : null;

    const deadheadMiles = deadheadReport?.distanceMiles ?? null;
    const loadedMiles = loadedReport?.distanceMiles ?? null;
    const totalMiles = this.addNullable(deadheadMiles, loadedMiles);
    const deadheadDriveMinutes = deadheadReport?.driveMinutes ?? null;
    const loadedDriveMinutes = loadedReport?.driveMinutes ?? null;
    const totalDriveMinutes = this.addNullable(deadheadDriveMinutes, loadedDriveMinutes);
    const postedRate = this.toNumber(request.postedRate);
    const suggestedRate = this.toNumber(request.suggestedRate) ?? postedRate;
    const mpg = this.toNumber(request.mpg);
    const fuelPrice = this.toNumber(request.fuelPricePerGallon);

    return {
      routeProvider: loadedReport?.provider ?? deadheadReport?.provider ?? this.routingService.providerName,
      providerStatus: this.providerStatus([loadedReport, deadheadReport]),
      truckLocationLabel: this.locationLabel(request.truckLocation, truckLocation),
      originLabel: this.locationLabel(request.origin, origin),
      destinationLabel: this.locationLabel(request.destination, destination),
      stops: (request.stops ?? []).map((stop, index) => this.locationLabel(stop, resolvedStops[index])),
      deadheadMiles,
      loadedMiles,
      totalMiles,
      deadheadDriveMinutes,
      loadedDriveMinutes,
      totalDriveMinutes,
      postedRate,
      suggestedRate,
      ratePerLoadedMile: this.ratePerMile(suggestedRate, loadedMiles),
      fuelEstimate: this.fuelEstimate(totalMiles, mpg, fuelPrice),
      tollEstimate: this.toNumber(request.tollEstimate),
      vehicleProfile: this.vehicleProfile(request),
      hazmatNotes: this.hazmatNotes(request, loadedReport, deadheadReport, mpg, fuelPrice),
      providerWarnings: warnings,
      alternativeRoutes: this.alternativeRoutes(loadedReport)
    };
  }

  private async resolveLocation(
    input: RoutingInputLocation | undefined,
    label: string,
    warnings: string[]
  ): Promise<RoutingLocation | null> {
    const coordinates = this.coordinates(input);
    if (coordinates) {
      return coordinates;
    }

    const query = this.locationQuery(input);
    if (query) {
      const geocode = await this.routingService.geocode(query);
      if (geocode) {
        return geocode;
      }
    }

    warnings.push(`${label} coordinates are missing.`);
    return null;
  }

  private async getLoadedRoute(
    origin: RoutingLocation,
    destination: RoutingLocation,
    stops: RoutingLocation[],
    request: RoutingIntelligenceRequestDTO
  ): Promise<RoutingRouteReport | null> {
    const vehicleProfile = this.vehicleProfile(request);
    const routePoints = [origin, ...stops, destination];
    if (routePoints.length <= 2) {
      return this.routingService.getRouteReport({ origin, destination, vehicleProfile });
    }

    const legs: RoutingRouteReport[] = [];
    for (let index = 0; index < routePoints.length - 1; index += 1) {
      const leg = await this.routingService.getRouteReport({
        origin: routePoints[index],
        destination: routePoints[index + 1],
        vehicleProfile
      });
      if (leg) {
        legs.push(leg);
      }
    }

    if (!legs.length) {
      return null;
    }

    return {
      distanceMiles: this.sum(legs.map((leg) => leg.distanceMiles)),
      driveMinutes: this.sum(legs.map((leg) => leg.driveMinutes)),
      provider: legs.find((leg) => leg.source === "provider")?.provider ?? legs[0].provider,
      source: legs.some((leg) => leg.source === "provider") ? "provider" : "fallback"
    };
  }

  private coordinates(input: RoutingInputLocation | undefined): RoutingLocation | null {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return {
      lat,
      lng,
      label: this.locationQuery(input)
    };
  }

  private locationQuery(input: RoutingInputLocation | undefined): string {
    return [input?.label, input?.city, input?.state]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }

  private locationLabel(input: RoutingInputLocation | undefined, resolved: RoutingLocation | null | undefined): string {
    return this.locationQuery(input) || resolved?.label || "Pending provider data";
  }

  private vehicleProfile(request: RoutingIntelligenceRequestDTO) {
    return {
      equipment: Array.isArray(request.equipment)
        ? request.equipment
        : String(request.equipment ?? "").split(/[\s,]+/).filter(Boolean),
      hazmat: true,
      weightLbs: this.toNumber(request.weightLbs)
    };
  }

  private providerStatus(reports: Array<RoutingRouteReport | null>): RoutingIntelligenceProviderStatus {
    if (reports.some((report) => report?.source === "provider")) {
      return "live";
    }
    if (reports.some((report) => report?.source === "fallback")) {
      return "fallback";
    }
    return "unavailable";
  }

  private hazmatNotes(
    request: RoutingIntelligenceRequestDTO,
    loadedReport: RoutingRouteReport | null,
    deadheadReport: RoutingRouteReport | null,
    mpg: number | null,
    fuelPrice: number | null
  ): string[] {
    const notes = [
      "Hazmat route restrictions are advisory until a live hazmat routing provider is connected.",
      "Verify placarding, segregation, tunnel restrictions, permits, and company safety policy before dispatch."
    ];
    if (loadedReport?.source === "provider" || deadheadReport?.source === "provider") {
      notes.push("Google routing is standard driving guidance and does not certify hazmat-legal routing.");
    }
    if (!mpg || !fuelPrice || this.toNumber(request.tollEstimate) === null) {
      notes.push("Fuel and toll estimates require connected providers or dispatcher-provided fuel, MPG, and toll inputs.");
    }
    return notes;
  }

  private alternativeRoutes(report: RoutingRouteReport | null): string[] {
    if (report?.source !== "provider") {
      return ["Alternative route details require Google Routes or a hazmat routing provider."];
    }
    return ["Live route provider connected. Hazmat-specific alternate routes still require a hazmat routing provider."];
  }

  private fuelEstimate(totalMiles: number | null, mpg: number | null, fuelPrice: number | null): number | null {
    if (!totalMiles || !mpg || !fuelPrice) {
      return null;
    }
    return this.roundMoney((totalMiles / mpg) * fuelPrice);
  }

  private ratePerMile(rate: number | null, miles: number | null): number | null {
    if (!rate || !miles) {
      return null;
    }
    return Math.round((rate / miles) * 100) / 100;
  }

  private addNullable(left: number | null, right: number | null): number | null {
    if (left === null && right === null) {
      return null;
    }
    return (left ?? 0) + (right ?? 0);
  }

  private sum(values: Array<number | null>): number | null {
    const numbers = values.filter((value): value is number => typeof value === "number");
    return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
  }

  private toNumber(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
