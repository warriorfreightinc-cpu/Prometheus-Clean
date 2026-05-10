import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { OnboardingDocumentType, OnboardingQueueGroup } from "./onboarding.constants";
import {
  InactivateCompanyDTO,
  RejectOnboardingDocumentDTO,
  RequestCorrectionDTO,
  RestoreCompanyDTO,
  SoftDeleteCompanyDTO,
  VerifyOnboardingDocumentDTO
} from "./dto/onboarding-action.dto";
import { OnboardingService } from "./onboarding.service";

@ApiExcludeController()
@Controller("company/onboarding")
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get("queue/:group")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  getQueue(@Param("group") group: OnboardingQueueGroup) {
    return this.onboardingService.getQueue(group);
  }

  @Get(":companyId")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  getDetail(@Param("companyId") companyId: string) {
    return this.onboardingService.getDetail(companyId);
  }

  @Patch(":companyId/document/:documentType/verify")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  verifyDocument(
    @Param("companyId") companyId: string,
    @Param("documentType") documentType: OnboardingDocumentType,
    @Body() body: VerifyOnboardingDocumentDTO,
    @Req() req
  ) {
    return this.onboardingService.verifyDocument(companyId, documentType, body, req.user);
  }

  @Patch(":companyId/document/:documentType/reject")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  rejectDocument(
    @Param("companyId") companyId: string,
    @Param("documentType") documentType: OnboardingDocumentType,
    @Body() body: RejectOnboardingDocumentDTO,
    @Req() req
  ) {
    return this.onboardingService.rejectDocument(companyId, documentType, body, req.user);
  }

  @Patch(":companyId/request-correction")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  requestCorrection(@Param("companyId") companyId: string, @Body() body: RequestCorrectionDTO, @Req() req) {
    return this.onboardingService.requestCorrection(companyId, body, req.user);
  }

  @Patch(":companyId/approve-paperwork")
  @Roles("superadmin")
  @HttpCode(HttpStatus.OK)
  approvePaperwork(@Param("companyId") companyId: string, @Req() req) {
    return this.onboardingService.approvePaperwork(companyId, req.user);
  }

  @Patch(":companyId/inactivate")
  @Roles("superadmin")
  @HttpCode(HttpStatus.OK)
  inactivateCompany(@Param("companyId") companyId: string, @Body() body: InactivateCompanyDTO, @Req() req) {
    return this.onboardingService.inactivateCompany(companyId, body, req.user);
  }

  @Patch(":companyId/restore")
  @Roles("superadmin")
  @HttpCode(HttpStatus.OK)
  restoreCompany(@Param("companyId") companyId: string, @Body() body: RestoreCompanyDTO, @Req() req) {
    return this.onboardingService.restoreCompany(companyId, body, req.user);
  }

  @Patch(":companyId/soft-delete")
  @Roles("superadmin")
  @HttpCode(HttpStatus.OK)
  softDeleteCompany(@Param("companyId") companyId: string, @Body() body: SoftDeleteCompanyDTO, @Req() req) {
    return this.onboardingService.softDeleteCompany(companyId, body, req.user);
  }

  @Delete(":companyId/purge")
  @Roles("superadmin")
  @HttpCode(HttpStatus.OK)
  purgeCompany(@Param("companyId") companyId: string, @Req() req) {
    return this.onboardingService.purgeCompany(companyId, req.user);
  }

  @Post(":companyId/resend-setup-email")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  resendSetupEmail(@Param("companyId") companyId: string, @Req() req) {
    return this.onboardingService.resendSetupEmail(companyId, req.user);
  }
}
