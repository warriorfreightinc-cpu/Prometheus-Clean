import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiConsumes, ApiOkResponse } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { CreateLoadFromRoomDTO } from "./dto/create-load-from-room.dto";
import { ResponseLoadDTO } from "./dto/response-load.dto";
import { UpdateLoadDTO } from "./dto/update-load.dto";
import { LoadsService } from "./loads.service";

@Controller("loads")
export class LoadsController {
  constructor(private readonly service: LoadsService) {}

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get("company")
  @ApiOkResponse({ status: 200, type: ResponseLoadDTO })
  getCompanyLoads(@Req() req) {
    return this.service.getCompanyLoads(req.user.companyId);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Get(":id")
  @ApiOkResponse({ status: 200, type: ResponseLoadDTO })
  getLoad(@Param("id") id: string, @Req() req) {
    return this.service.getLoadById(id, req.user.companyId);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Post("from-room")
  @ApiOkResponse({ status: 200, type: ResponseLoadDTO })
  @ApiConsumes("multipart/form-data")
  createFromRoom(@Body() data: CreateLoadFromRoomDTO, @Req() req) {
    return this.service.createFromRoom(data, req.user);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Patch(":id")
  @ApiOkResponse({ status: 200, type: ResponseLoadDTO })
  @ApiConsumes("multipart/form-data")
  updateLoad(@Param("id") id: string, @Body() data: UpdateLoadDTO, @Req() req) {
    return this.service.updateLoad(id, req.user.companyId, req.user, data);
  }

  @Roles("broker", "carrier", "admin", "manager", "supervisor")
  @Delete(":id")
  deleteLoad(@Param("id") id: string, @Req() req) {
    return this.service.deleteLoad(id, req.user.companyId, req.user);
  }
}
