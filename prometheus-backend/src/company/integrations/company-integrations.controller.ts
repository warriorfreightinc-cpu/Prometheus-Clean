import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { CompanyIntegrationsService } from "./company-integrations.service";
import {
  ExecuteRoomIntegrationDTO,
  RoomIntegrationChoicesQueryDTO,
  UpdateCompanyIntegrationDTO,
  UpsertCompanyIntegrationDTO
} from "./dto/company-integration.dto";

@ApiExcludeController()
@Controller("company/integrations")
export class CompanyIntegrationsController {
  constructor(private readonly service: CompanyIntegrationsService) {}

  @Get("room")
  @Roles("carrier", "broker", "admin", "manager", "supervisor")
  @HttpCode(HttpStatus.OK)
  getRoomChoices(@Req() req, @Query() query: RoomIntegrationChoicesQueryDTO) {
    return this.service.getRoomIntegrationChoices(query, req.user);
  }

  @Post("room/execute")
  @Roles("carrier", "broker", "admin", "manager", "supervisor")
  @HttpCode(HttpStatus.OK)
  executeRoomIntegration(@Req() req, @Body() body: ExecuteRoomIntegrationDTO) {
    return this.service.executeRoomIntegration(body, req.user);
  }

  @Get()
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  list(@Req() req) {
    return this.service.listIntegrations(req.user.companyId);
  }

  @Post()
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  upsert(@Req() req, @Body() body: UpsertCompanyIntegrationDTO) {
    return this.service.upsertIntegration(req.user.companyId, req.user, body);
  }

  @Patch(":id")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  update(@Req() req, @Param("id") id: string, @Body() body: UpdateCompanyIntegrationDTO) {
    return this.service.updateIntegration(req.user.companyId, id, req.user, body);
  }

  @Delete(":id")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  disable(@Req() req, @Param("id") id: string) {
    return this.service.disableIntegration(req.user.companyId, id, req.user);
  }
}
