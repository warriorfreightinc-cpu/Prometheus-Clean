import { RoutingLocation, RoutingVehicleProfile } from "../interfaces/routing-provider.interface";

export type RoutingIntelligenceProviderStatus = "live" | "fallback" | "unavailable";

export interface RoutingInputLocation extends Partial<RoutingLocation> {
  city?: string;
  state?: string;
}

export interface RoutingIntelligenceRequestDTO {
  truckLocation?: RoutingInputLocation;
  origin?: RoutingInputLocation;
  destination?: RoutingInputLocation;
  stops?: RoutingInputLocation[];
  equipment?: string[] | string;
  weightLbs?: number | string | null;
  postedRate?: number | string | null;
  suggestedRate?: number | string | null;
  fuelPricePerGallon?: number | string | null;
  mpg?: number | string | null;
  tollEstimate?: number | string | null;
}

export interface RoutingIntelligenceResponseDTO {
  routeProvider: string;
  providerStatus: RoutingIntelligenceProviderStatus;
  truckLocationLabel: string;
  originLabel: string;
  destinationLabel: string;
  stops: string[];
  deadheadMiles: number | null;
  loadedMiles: number | null;
  totalMiles: number | null;
  deadheadDriveMinutes: number | null;
  loadedDriveMinutes: number | null;
  totalDriveMinutes: number | null;
  postedRate: number | null;
  suggestedRate: number | null;
  ratePerLoadedMile: number | null;
  fuelEstimate: number | null;
  tollEstimate: number | null;
  vehicleProfile: RoutingVehicleProfile;
  hazmatNotes: string[];
  providerWarnings: string[];
  alternativeRoutes: string[];
}
