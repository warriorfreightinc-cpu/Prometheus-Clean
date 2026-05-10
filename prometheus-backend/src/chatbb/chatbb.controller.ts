import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { ApiConsumes, ApiExcludeController, ApiOkResponse } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { ChatbbMessageDTO, ChatbbThreadDTO } from "./dto/chatbb.dto";
import { ChatbbService } from "./chatbb.service";

@ApiExcludeController()
@Controller("chatbb")
export class ChatbbController {
  constructor(private readonly service: ChatbbService) {}

  @Roles("carrier", "broker")
  @Get("runtime")
  @ApiOkResponse({ status: 200 })
  getRuntimeStatus() {
    return this.service.getRuntimeStatus();
  }

  @Roles("carrier", "broker")
  @Get("thread")
  @ApiOkResponse({ status: 200 })
  getThread(@Req() req, @Query("carrierPostId") carrierPostId: string, @Query("brokerPostId") brokerPostId: string) {
    return this.service.getThread(req.user, carrierPostId, brokerPostId);
  }

  @Roles("carrier", "broker")
  @Post("context")
  @ApiOkResponse({ status: 200 })
  @ApiConsumes("multipart/form-data")
  getContext(@Req() req, @Body() data: ChatbbThreadDTO) {
    return this.service.buildContextPreview(req.user, data.carrierPostId, data.brokerPostId);
  }

  @Roles("carrier", "broker")
  @Post("message")
  @ApiOkResponse({ status: 200 })
  @ApiConsumes("multipart/form-data")
  sendMessage(@Req() req, @Body() data: ChatbbMessageDTO) {
    return this.service.sendMessage(
      req.user,
      data.carrierPostId,
      data.brokerPostId,
      data.prompt,
      data.previewOnly
    );
  }
}
