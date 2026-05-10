import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { Public } from "../shared/decorators/public.decorator";
import { AuthService } from "./auth.service";
import { RequestLogInDTO } from "./dto/request-login.dto";

@ApiTags("login")
@Controller()
export class AuthController {
  constructor(private readonly service: AuthService) { }

  @Post("login")
  @Public()
  async login(@Body() loginDTO: RequestLogInDTO, @Req() req): Promise<{ token: string }> {
    // if(req.headers.signature)
    //   return await this.service.loginBatch(loginDTO,req.headers.signature);
    // else
    return await this.service.login(loginDTO);
  }

  @Post("loginCheck")
  @ApiExcludeEndpoint()
  @Public()
  async loginCheck(@Body() loginDTO: RequestLogInDTO, @Req() req): Promise<{ token: string }> {

    // if(req.headers.signature)
    //   return await this.service.loginBatch(loginDTO,req.headers.signature);
    // else
    return await this.service.checkLogin(loginDTO, req);
  }

  @Roles('broker', 'carrier', 'superadmin', 'admin', 'supervisor', 'manager')
  @Post("signOut")
  @ApiExcludeEndpoint()
  async signOut(@Req() req): Promise<any> {

    // if(req.headers.signature)
    //   return await this.service.loginBatch(loginDTO,req.headers.signature);
    // else
    return await this.service.signOut(req);
  }
  @Public()
  @Post("clearSession")
  @ApiExcludeEndpoint()
  async clearSession(@Body() user): Promise<any> {

    // if(req.headers.signature)
    //   return await this.service.loginBatch(loginDTO,req.headers.signature);
    // else
    return await this.service.sessionClear(user);
  }

  @Post("setInToken")
  @Public()
  @ApiExcludeEndpoint()
  async setCompanyIdInToken(@Body() data): Promise<{ token: string }> {
    return await this.service.setCompanyIdInToken(data);
  }

  @Post("clearCompanyId")
  @Public()
  @ApiExcludeEndpoint()
  async clearCompanyId(@Body() supervisorId): Promise<{ token: string }> {
    return await this.service.clearCompanyId(supervisorId);
  }

  @Post('switch-role')
  @ApiExcludeEndpoint()
  async switchRole(@Req() req, @Body() body: { newRole: string }): Promise<{ token: string }> {
    const userId = req.user._id;
    const { newRole } = body;
    return await this.service.switchRole(userId, newRole);
  }

  @Roles('broker', 'carrier', 'superadmin', 'admin', 'supervisor', 'manager', 'batch')
  @Get("session-status")
  @ApiExcludeEndpoint()
  async sessionStatus(): Promise<{ active: boolean }> {
    return { active: true };
  }
}
