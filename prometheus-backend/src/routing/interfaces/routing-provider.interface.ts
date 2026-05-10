export interface RoutingLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface RoutingVehicleProfile {
  equipment?: string[];
  hazmat?: boolean | null;
  weightLbs?: number | null;
  heightFt?: number | null;
}

export interface RoutingGeocodeResult extends RoutingLocation {
  formattedAddress?: string;
}

export interface RoutingRouteReport {
  distanceMiles: number | null;
  driveMinutes: number | null;
  provider: string;
  source: "provider" | "fallback";
}

export interface RoutingRouteMatrixCell {
  originIndex: number;
  destinationIndex: number;
  distanceMiles: number | null;
  driveMinutes: number | null;
}

export interface RoutingRouteReportRequest {
  origin: RoutingLocation;
  destination: RoutingLocation;
  vehicleProfile?: RoutingVehicleProfile;
}

export interface RoutingRouteMatrixRequest {
  origins: RoutingLocation[];
  destinations: RoutingLocation[];
  vehicleProfile?: RoutingVehicleProfile;
}

export interface RoutingProvider {
  readonly name: string;
  geocode(query: string): Promise<RoutingGeocodeResult | null>;
  getRouteReport(request: RoutingRouteReportRequest): Promise<RoutingRouteReport | null>;
  getRouteMatrix(request: RoutingRouteMatrixRequest): Promise<RoutingRouteMatrixCell[]>;
}
