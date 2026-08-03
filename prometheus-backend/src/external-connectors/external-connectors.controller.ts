import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { Roles } from "../shared/decorators/roles.decorator";
import { Public } from "../shared/decorators/public.decorator";
import { ExternalFreightBatchDTO } from "./dto/external-connector.dto";
import { ExternalConnectorsService } from "./external-connectors.service";

@Controller("external-connectors")
export class ExternalConnectorsController {
  constructor(private readonly service: ExternalConnectorsService) {}

  @Public()
  @Post("webhooks/:integrationId")
  @HttpCode(HttpStatus.OK)
  ingest(
    @Param("integrationId") integrationId: string,
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-prometheus-connector-key") connectorKey: string | undefined,
    @Body() body: ExternalFreightBatchDTO
  ) {
    return this.service.ingestWebhook(integrationId, authorization, connectorKey, body);
  }

  @Roles("carrier", "broker", "admin", "manager", "supervisor")
  @Get("opportunities")
  list(
    @Req() req,
    @Query("kind") kind?: "load" | "truck",
    @Query("limit") limit?: string
  ) {
    return this.service.listForCompany(
      String(req.user.companyId),
      kind === "truck" ? "truck" : "load",
      Number(limit ?? 100)
    );
  }
}
