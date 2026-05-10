import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { CompanySetupService } from "./company-setup.service";
import { LocalActivateCompanyDTO } from "./dto/company-setup.dto";

@ApiExcludeController()
@Controller("company/setup")
export class CompanySetupController {
  constructor(private readonly setupService: CompanySetupService) {}

  @Get("status")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  getStatus(@Req() req) {
    return this.setupService.getStatus(req.user.companyId);
  }

  @Post("local-activate")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  localActivate(@Req() req, @Body() body: LocalActivateCompanyDTO) {
    return this.setupService.localActivate(req.user.companyId, body);
  }
}
