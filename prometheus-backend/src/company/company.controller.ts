import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiExcludeController, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { diskStorage } from "multer";
// import { InjectStripe } from "nestjs-stripe";
import { JwtCompanyGuard } from "src/auth/company.guard";
import { editDestination, editFileName, renewDestination } from "src/file-management/file-utils";
import { Public } from "src/shared/decorators/public.decorator";
import { ResponseSuccessDTO } from "src/shared/dto/response-success.dto";
import { CompanyService } from "./company.service";
import { CreateCompanyDTO } from "./dto/create-company.dto";
import { ResponseCompanyDTO } from "./dto/response.company.dto";

import { Response } from "express";
import { Roles } from "src/shared/decorators/roles.decorator";
import { ResponseHistoryDTO } from "./dto/history.dto";
import { UpdateCompanyDTO } from "./dto/update-company.dto";

// @ApiTags("api")
@ApiExcludeController()
@Controller("company")
export class CompanyController {
  constructor(private service: CompanyService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: 10_000 } }) // 1 request per 10 seconds
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseCompanyDTO })
  async create(@Body() body: CreateCompanyDTO) {
    return this.service.create(body);
  }

  @UseGuards(JwtCompanyGuard)
  @Public()
  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseCompanyDTO })
  async update(@Req() req, @Body() body: UpdateCompanyDTO) {
    return this.service.update(req.companyId, body);
  }

  @Roles("superadmin", "supervisor")
  @Patch('updateBySupervisor/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseCompanyDTO })
  async updateBySupervisor(@Param() id , @Body() body: UpdateCompanyDTO) {
    return this.service.updateBySupervisor(id.id, body);
  }


  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyCompany(@Req() req): Promise<ResponseCompanyDTO> {
    return await this.service.getCompanyById(req.user.companyId);
  }

  @Get("history")
  @HttpCode(HttpStatus.OK)
  async getHistory(@Req() req): Promise<ResponseHistoryDTO> {
    return await this.service.getHistory(req.user.companyId);
  }

  @Get("supervisor")
  @HttpCode(HttpStatus.OK)
  async getCompanySupervisor(@Req() req): Promise<ResponseCompanyDTO> {
    return await this.service.getCompanyByIdSupervisor(req.user.companyId);
  }

  @Get("all")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  async getAllCompanies(): Promise<ResponseCompanyDTO> {
    return await this.service.getAllCompanies();
  }
  @Patch("search")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  async search(@Body() text): Promise<ResponseCompanyDTO> {
    return await this.service.search(text);
  }

  @UseGuards(JwtCompanyGuard)
  @Public()
  @Get("draft")
  getDraftCompany(@Req() req): Promise<ResponseCompanyDTO> {
    
    return this.service.getCompanyById(req.companyId);
  }

  @UseGuards(JwtCompanyGuard)
  @Public()
  @Delete()
  async deleteDraftCompany(@Req() req) {
    this.service.deleteCompanyById(req.companyId);
    return { result: "OK" };
  }

  @UseGuards(JwtCompanyGuard)
  @Public()
  @Patch("pending")
  async changeStatusPending(@Req() req) {


    await this.service.changeCompanyStatus(req.companyId, "pending");
    return { result: "OK" };
  }

  @Put("status/:type/:id")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  async changeCompanyStatus(@Param("id") id: string, @Param("type") type: string): Promise<ResponseCompanyDTO> {
    return await this.service.changeCompanyStatus(id, type);
  }

  @Put("waiting/:isWaiting/:id")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  async manageWaiting(@Param("id") id: string, @Param("isWaiting") isWaiting: boolean,@Req() req): Promise<ResponseCompanyDTO> {
    return await this.service.manageWaiting(id, isWaiting, req.user.firstName, req.user.lastName);
  }

  @Get("status/:type")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  async getCompaniesByStatus(@Param("type") type: string): Promise<ResponseCompanyDTO> {
    return await this.service.getCompaniesByStatus(type);
  }
  @Get(":id")
  @Roles("superadmin", "supervisor")
  @HttpCode(HttpStatus.OK)
  async getCompanyId(@Param("id") id: string): Promise<ResponseCompanyDTO> {
    return await this.service.getCompanyById(id);
  }

  @Get("download/:company/:fileType/:extension")
  @Public()
  @HttpCode(HttpStatus.OK)
  async download(@Param("company") company, @Param("fileType") fileType, @Param("extension") extension, @Res() res: Response) {
    return res.sendFile(`${company}/${fileType}.${extension}`, { root: "./files" });
    //return createReadStream(`./files/${company}/failEdno.docx`)
  }

  @Roles("superadmin", "supervisor")
  @Patch("notes/:companyId")
  @ApiOkResponse({ status: 200, type: CreateCompanyDTO })
  @ApiConsumes("multipart/form-data")
  addToNotes(@Body() note, @Req() req, @Param("companyId") companyId) {
    return this.service.addNote(note, companyId, req.user.name, req.user.lastName);
  }

  @Roles("superadmin", "supervisor")
  @Patch("expDate/:companyId")
  @ApiOkResponse({ status: 200, type: CreateCompanyDTO })
  @ApiConsumes("multipart/form-data")
  changeFileExpDate(@Body() data, @Req() req, @Param("companyId") companyId) {
    return this.service.changeFileExpDate(data, companyId,req.user);
  }

  @Get("preview/:company/:fileType")
  @Public()
  @HttpCode(HttpStatus.OK)
  async preview(@Param("company") company, @Param("fileType") fileType, @Res() res: Response) {
    const fs = require("fs");
    const dir = `./files/${company}`;
    let type;
    let html;
    const Results: Array<string> = new Array<string>();
    let files = await fs.promises.readdir(dir);
    files.forEach((file) => {
      if (fileType === file.split(".")[0]) {
        type = file.split(".")[1];

        //`${company}/${fileType}.${type}`, { root: './files'})
      }
    });
    if (type === "pdf") {
      return res.sendFile(`${company}/${fileType}.pdf`, { root: "./files" });
    } else {
      let html = await this.service.getDocPreview(`files/${company}/${fileType}.${type}`);
      res.send(html);
    }

    //return createReadStream(`./files/${company}/failEdno.docx`)
  }

  @UseGuards(ThrottlerGuard, JwtCompanyGuard)
  @Throttle({ default: { limit: 3, ttl: 10_000 } }) // 3 requests per 10 seconds
  @Public()
  @Post("upload/:fileType")
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({ destination: editDestination, filename: editFileName }),
      limits: {
        fileSize: 1024 * 1024 * 20 //20MB
      }
    })
  )
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseSuccessDTO })
  @ApiConsumes("multipart/form-data")
  async uploadCompanyResources(
    @Req() req,
    @Param("companyId") projectId: string,
    @Param("fileType") fileType: string,
    @UploadedFiles() files
  ): Promise<ResponseSuccessDTO> {
    this.service.update(req.companyId, { filesUploaded: true });
    return { message: "OK" };
  }
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 10_000 } }) // 3 requests per 10 seconds
  @Roles("superadmin", "supervisor", "admin")
  @Post("renew/:fileType/:ext")
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({ destination: renewDestination, filename: editFileName }),
      limits: {
        fileSize: 1024 * 1024 * 20 //20MB
      }
    })
  )
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: ResponseSuccessDTO })
  @ApiConsumes("multipart/form-data")
  async renewCompanyResources(
    @Req() req,
    @Param("companyId") projectId: string,
    @Param("fileType") fileType: string,
    @Param("ext") ext: string,
    @UploadedFiles() files
  ): Promise<ResponseCompanyDTO> {
    return this.service.renew(req.user.companyId, fileType, ext ,req.user.email);
  }

  @Post("send-mail")
  @HttpCode(HttpStatus.OK)
  async sendMailActivaion(@Body() data: any) {
    return await this.service.sendActivationMail(data);
  }
  

  @Post("checkExpDate")
  async updateDates() {

    await this.service.sendExpirationReminder();
    await this.service.checkAndUpdateStatus();
  }

  @Post("updateDecreasedUsers")
  async updateDecreasedUsers(@Req() req) {

    await this.service.updateDecreasedUsers(req.user.companyId);
    await this.service.checkAndUpdateStatus();
  }
}
