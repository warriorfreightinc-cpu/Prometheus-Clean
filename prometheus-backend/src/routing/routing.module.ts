import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FallbackRoutingProvider } from "./providers/fallback-routing.provider";
import { GoogleMapsRoutingProvider } from "./providers/google-maps-routing.provider";
import { RoutingController } from "./routing.controller";
import { ROUTING_PROVIDER } from "./routing.constants";
import { RoutingIntelligenceService } from "./routing-intelligence.service";
import { RoutingService } from "./routing.service";

@Module({
  controllers: [RoutingController],
  providers: [
    FallbackRoutingProvider,
    GoogleMapsRoutingProvider,
    RoutingService,
    RoutingIntelligenceService,
    {
      provide: ROUTING_PROVIDER,
      useFactory: (
        configService: ConfigService,
        googleProvider: GoogleMapsRoutingProvider,
        fallbackProvider: FallbackRoutingProvider
      ) => {
        const googleKey = (
          configService.get<string>("GOOGLE_MAPS_API_KEY") ||
          configService.get<string>("AgmCoreModule") ||
          ""
        ).trim();
        return googleKey ? googleProvider : fallbackProvider;
      },
      inject: [ConfigService, GoogleMapsRoutingProvider, FallbackRoutingProvider],
    },
  ],
  exports: [RoutingService, RoutingIntelligenceService, ROUTING_PROVIDER],
})
export class RoutingModule {}
