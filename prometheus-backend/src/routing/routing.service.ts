import { Inject, Injectable } from "@nestjs/common";
import {
  RoutingGeocodeResult,
  RoutingProvider,
  RoutingRouteMatrixCell,
  RoutingRouteMatrixRequest,
  RoutingRouteReport,
  RoutingRouteReportRequest,
} from "./interfaces/routing-provider.interface";
import { ROUTING_PROVIDER } from "./routing.constants";

@Injectable()
export class RoutingService {
  constructor(
    @Inject(ROUTING_PROVIDER) private readonly provider: RoutingProvider
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  geocode(query: string): Promise<RoutingGeocodeResult | null> {
    return this.provider.geocode(query);
  }

  getRouteReport(
    request: RoutingRouteReportRequest
  ): Promise<RoutingRouteReport | null> {
    return this.provider.getRouteReport(request);
  }

  getRouteMatrix(
    request: RoutingRouteMatrixRequest
  ): Promise<RoutingRouteMatrixCell[]> {
    return this.provider.getRouteMatrix(request);
  }
}
