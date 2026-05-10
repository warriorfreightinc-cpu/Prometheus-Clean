import { Module } from "@nestjs/common";
import { FallbackRoutingProvider } from "./providers/fallback-routing.provider";
import { ROUTING_PROVIDER } from "./routing.constants";
import { RoutingService } from "./routing.service";

@Module({
  providers: [
    FallbackRoutingProvider,
    RoutingService,
    {
      provide: ROUTING_PROVIDER,
      useExisting: FallbackRoutingProvider,
    },
  ],
  exports: [RoutingService, ROUTING_PROVIDER],
})
export class RoutingModule {}
