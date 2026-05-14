import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { RoutingIntelligenceRequestDTO } from "./dto/routing-intelligence.dto";
import { RoutingIntelligenceService } from "./routing-intelligence.service";

@ApiExcludeController()
@Controller("routing")
export class RoutingController {
  constructor(private readonly routingIntelligenceService: RoutingIntelligenceService) {}

  @Post("intelligence")
  @Roles("carrier", "broker", "admin", "manager", "supervisor")
  @HttpCode(HttpStatus.OK)
  routeIntelligence(@Body() body: RoutingIntelligenceRequestDTO) {
    return this.routingIntelligenceService.buildRouteIntelligence(body);
  }
}
