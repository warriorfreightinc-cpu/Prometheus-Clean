import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Roles } from "../shared/decorators/roles.decorator";
import {
  MatchingAssistantCommandDTO,
  OpportunityActionDTO,
} from "./dto/matching-assistant.dto";
import { CreateMatchSnapshotDTO } from "./dto/matching.dto";
import { MatchSourcePostType } from "./interface/match-snapshot.interface";
import { MatchingAssistantService } from "./matching-assistant.service";
import { MatchingService } from "./matching.service";

@ApiTags("matching")
@Controller("matching")
export class MatchingController {
  constructor(
    private readonly service: MatchingService,
    private readonly assistant: MatchingAssistantService
  ) {}

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Post("snapshots")
  @ApiOkResponse({ status: 200 })
  async createSnapshot(@Body() data: CreateMatchSnapshotDTO, @Req() req) {
    if (data.sourcePostType === "brokerPost") {
      return this.service.createSnapshotForBrokerPost(
        data.sourcePostId,
        String(req.user._id)
      );
    }

    if (data.sourcePostType === "carrierPost") {
      return this.service.createSnapshotForCarrierPost(
        data.sourcePostId,
        String(req.user._id)
      );
    }

    throw new BadRequestException("Unknown match source post type.");
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get("snapshots/latest/:sourcePostType/:sourcePostId")
  @ApiOkResponse({ status: 200 })
  getLatest(
    @Param("sourcePostType") sourcePostType: MatchSourcePostType,
    @Param("sourcePostId") sourcePostId: string
  ) {
    return this.service.getLatestSnapshot(sourcePostType, sourcePostId);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get("assistant/events")
  @ApiOkResponse({ status: 200 })
  listAssistantEvents(@Req() req) {
    return this.assistant.listEvents(req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Post("assistant/command")
  @ApiOkResponse({ status: 200 })
  handleAssistantCommand(
    @Body() data: MatchingAssistantCommandDTO,
    @Req() req
  ) {
    return this.assistant.handleCommand(data, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Patch("opportunities/:opportunityId/action")
  @ApiOkResponse({ status: 200 })
  handleOpportunityAction(
    @Param("opportunityId") opportunityId: string,
    @Body() data: OpportunityActionDTO,
    @Req() req
  ) {
    return this.assistant.handleAction(opportunityId, data.action, req.user);
  }
}
