import { Controller, Get, Post, Body, Param, Put, Req, Res, Query, HttpCode, HttpStatus, ParseIntPipe, UseGuards, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Response, Request } from "express";
import { UserService } from "./user.service";
import { CreateUserDTO } from "./dto/create-user.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";
import { ResetPasswordDTO } from "./dto/reset-password.dto";
import { ResponseSuccessDTO } from "../shared/dto/response-success.dto";
import { Public } from "../shared/decorators/public.decorator";
import { ResponseUserDTO } from "./dto/response-user.dto";
import { ChangeStatusDto } from "src/shared/dto/change-status.dto";


import { Roles } from "src/shared/decorators/roles.decorator";

import { JwtCompanyGuard } from "src/auth/company.guard";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { CreateAdminDTO } from "./dto/create-admin.dto";
import { UpdateAdminDTO } from "./dto/update-admin.dto";
import { ResponsePreviewsDTO } from "./dto/previews.dto";
import { ResponseAdminEmailDTO } from "./dto/response-admin-email";

@ApiBearerAuth()
@ApiExcludeController()
// @ApiTags("users")
@Controller("users")
export class UserController {
  constructor(private readonly service: UserService) { }



  @Roles('admin','supervisor','manager')
  @Post()
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  createUser(@Body() userDto: CreateUserDTO, @Req() req): Promise<ResponseUserDTO> {
    const origin = req.headers.origin;
    return this.service.createUser(req.user.companyId, userDto, origin)
  }

  @Get('admin/:id')
  @Roles("superadmin")
  @ApiOkResponse({ status: 200, type: ResponseAdminEmailDTO })
  getAdminEmail(@Param() id): ResponseAdminEmailDTO {

    return this.service.getAdminEmail(id)
  }

  @Get('previews')
  @ApiOkResponse({ status: 200, type: ResponsePreviewsDTO})
  getPreviews(@Req() req){

    return this.service.getPreviews(req.user._id)
  }
  @Post('previews/:postId')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  addToPreviewedposts(@Param() postId,@Req() req){
    return this.service.addToPreviewedposts(req.user._id, postId)
  }

  @Get('blacklist')
  @ApiOkResponse({ status: 200, type: ResponsePreviewsDTO})
  getBlacklist(@Req() req){
    return this.service.getBlacklist(req.user._id)
  }
  @Post('blacklist/:companyId')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  addToBlacklist(@Param() companyId,@Req() req){
    return this.service.addToBlacklist(req.user._id, companyId)
  }
  @Patch('blacklist/:companyId')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  removeFromBlacklist(@Param() companyId,@Req() req){
    return this.service.removeFromBlacklist(req.user._id, companyId)
  }
  @Roles('superadmin')
  @Post('supervisors')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  createSupervisor(@Body() userDto: CreateUserDTO, @Req() req): Promise<ResponseUserDTO> {
    const origin = req.headers.origin;
    return this.service.createSupervisor(userDto, origin)
  }

  @Roles('carrier','broker','admin')
  @Patch("update/me")
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  updateMe(@Body() userDto: UpdateUserDTO, @Req() req): Promise<ResponseUserDTO> {
    return this.service.updateMe(req.user._id,req.user.companyId, userDto)
  }



  @Roles('admin','supervisor','superadmin','manager')
  @Patch('changeStatus')
  changeUserStatus(@Body() user): Promise<ResponseUserDTO> {
    return this.service.changeUserStatus(user)
  }

  @Roles('admin','supervisor','superadmin','manager')
  @Patch(":id")
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  updateUser(@Param("id") id: string, @Body() userDto: UpdateUserDTO, @Req() req): Promise<ResponseUserDTO> {
    return this.service.updateUser(id, req.user.companyId, userDto)
  }

  @Roles('superadmin')
  @Patch("supervisors/:id")
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  updateSupervisor(@Param("id") id: string, @Body() userDto: UpdateUserDTO, @Req() req): Promise<ResponseUserDTO> {
    return this.service.updateSupervisor(id, userDto)
  }

  @Post("create-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseSuccessDTO })
  async activateAccount(@Body() user: any): Promise<ResponseSuccessDTO> {
    return this.service.changeForgottenPassword(user.password, user.email, false);
  }
  @Post("forgot-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseSuccessDTO })
  async ForgottenPassword(@Body() user, @Req() req) {
    const origin = req.headers.origin;
    return this.service.forgottenPassword(user.email,origin);
  }
  @Roles('carrier','broker','admin','supervisor','superadmin','manager')
  @Post("update-password")
  @ApiOkResponse({ status: 200, type: ResponseSuccessDTO })
  async updatePassword(@Body() data: ResetPasswordDTO,@Req() req): Promise<ResponseSuccessDTO> {
    return this.service.updatePassword(data, req.user._id  , false);
  }


  // @Post("update-password")
  // @ApiOkResponse({ status: 200, type: ResponsePreviewsDTO})
  // updatePassword(@Body() data ,@Req() req){
  //   return
  //   return this.service.updatePassword(data, req.user._id  , false);
  // }

  @Public()
  @UseGuards(ThrottlerGuard, JwtCompanyGuard)
  @Throttle({ default: { limit: 3, ttl: 10_000 } }) // 3 requests per 10 seconds
  @Post("admin")
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  createCompanyAdmin(@Body() userDto: CreateAdminDTO, @Req() req): Promise<ResponseUserDTO> {
    return this.service.createAdmin(req.companyId, userDto)
  }

  @Public()
  @UseGuards(JwtCompanyGuard)
  @Patch("draft/admin")
  @ApiOkResponse({ status: 200, type: UpdateAdminDTO })
  updateCompanyAdmin(@Body() userDto: UpdateAdminDTO, @Req() req): Promise<ResponseUserDTO> {
    return this.service.updateAdmin(req.companyId, userDto)
  }

  @Public()
  @UseGuards(JwtCompanyGuard)
  @Get("draft/admin")
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  getDraftCompanyAdmin(@Req() req): Promise<ResponseUserDTO> {
    return this.service.getDraftAdmin(req.companyId)
  }

  @Get()
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  getUsers(@Req() req): Promise<ResponseUserDTO[]> {

    return this.service.getUsers(req.user.companyId,req.user.role)
  }


  @Get('supervisors')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  getSupervisors(@Req() req): Promise<ResponseUserDTO[]> {

    return this.service.getSupervisors()
  }

  @Get('all')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  getUsersByCompany(@Req() req): Promise<ResponseUserDTO[]> {

    return this.service.getUsersByCompany(req.user.companyId,req.user._id,req.user.role)
  }

  @Get('me')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  getCurrentUser(@Req() req): Promise<ResponseUserDTO> {
    return this.service.getUser(req.user._id)
  }

  @Get('me/contact')
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  getCurrentUserContact(@Req() req): Promise<ResponseUserDTO> {
    return this.service.getUserContact(req.user._id)
  }

  @Post("notify/:id")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseUserDTO })
  async notify(@Param("id") id: string, @Body() data: any): Promise<any> {
    this.service.notify(id, data);
    return "OK";
  }

  // @Put('set-contact-email')
  // @HttpCode(HttpStatus.OK)
  // async setContactInfo():Promise<any>{
  //   await this.service.setContactPerson();
  // }

  @Put('subscription-email')
  @HttpCode(HttpStatus.OK)
  async setSubscription():Promise<any>{
    await this.service.setSubscrioptionEmail();
  }


}
