import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Roles } from "../shared/decorators/roles.decorator";
import { BrainAiProviderGateway } from "./ai-provider/brain-ai-provider.gateway";
import { BrainApprovalService } from "./brain-approval.service";
import { BrainEventService } from "./brain-event.service";
import { BrainMemoryService } from "./brain-memory.service";
import { BrainSettingsService } from "./brain-settings.service";
import {
  PrometheusBrainPromptDTO,
  UpdateBrainSettingsDTO,
} from "./dto/prometheus-brain.dto";
import { PrometheusBrainService } from "./prometheus-brain.service";

@ApiTags("brain")
@Controller("brain")
export class PrometheusBrainController {
  constructor(
    private readonly brain: PrometheusBrainService,
    private readonly events: BrainEventService,
    private readonly approvals: BrainApprovalService,
    private readonly memory: BrainMemoryService,
    private readonly settings: BrainSettingsService,
    private readonly aiProvider: BrainAiProviderGateway
  ) {}

  @Roles("broker", "carrier", "admin", "manager", "supervisor", "superadmin")
  @Post("prompt")
  @ApiOkResponse({ status: 200 })
  prompt(@Body() data: PrometheusBrainPromptDTO, @Req() req) {
    return this.brain.handlePrompt(data, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor", "superadmin")
  @Get("events")
  @ApiOkResponse({ status: 200 })
  listEvents(@Req() req) {
    return this.events.listForCompany(String(req.user.companyId ?? ""));
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor", "superadmin")
  @Get("approvals")
  @ApiOkResponse({ status: 200 })
  listApprovals(@Req() req) {
    return this.approvals.listForCompany(String(req.user.companyId ?? ""));
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor", "superadmin")
  @Patch("approvals/:approvalId/approve")
  @ApiOkResponse({ status: 200 })
  approve(@Param("approvalId") approvalId: string, @Req() req) {
    return this.approvals.approve(approvalId, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor", "superadmin")
  @Patch("approvals/:approvalId/reject")
  @ApiOkResponse({ status: 200 })
  reject(@Param("approvalId") approvalId: string, @Req() req) {
    return this.approvals.reject(approvalId, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor", "superadmin")
  @Get("memory")
  @ApiOkResponse({ status: 200 })
  listMemory(@Req() req) {
    return this.memory.listForCompany(String(req.user.companyId ?? ""));
  }

  @Roles("admin", "supervisor", "superadmin")
  @Get("settings")
  @ApiOkResponse({ status: 200 })
  getSettings(@Req() req) {
    return this.settings.getCompanySettings(String(req.user.companyId ?? ""));
  }

  @Roles("admin", "supervisor", "superadmin")
  @Patch("settings")
  @ApiOkResponse({ status: 200 })
  updateSettings(@Body() data: UpdateBrainSettingsDTO, @Req() req) {
    return this.settings.updateCompanySettings(
      String(req.user.companyId ?? ""),
      String(req.user._id ?? ""),
      data
    );
  }

  @Roles("admin", "supervisor", "superadmin")
  @Post("settings/test-provider")
  @ApiOkResponse({ status: 200 })
  testProvider(@Req() req) {
    return this.aiProvider.testProvider(String(req.user.companyId ?? ""));
  }
}
