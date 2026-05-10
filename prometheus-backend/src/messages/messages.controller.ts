import { Body, Controller, Get, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiConsumes, ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/shared/decorators/roles.decorator';
import { MessageDTO } from './dto/create-message.dto';
import { UpdateBookingWorkflowDTO } from './dto/update-booking-workflow.dto';
import { UpdateBookingStatusDTO } from './dto/update-booking-status.dto';
import { MessagesService } from './messages.service';


// @ApiTags("messages")
@ApiExcludeController()
@Controller('messages')
export class MessagesController {
    constructor(private readonly service: MessagesService) { }

    @Roles('carrier','broker')
    @Post()
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    addMessage(@Body() data, @Req() req) {
      return this.service.addMessage(data, req.user.role);
    }

    @Roles('carrier','broker')
    @Post('all')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    getMessage(@Body() data,) {
      return this.service.getMessage(data);
    }

    @Roles('carrier','broker')
    @Post('clearCount')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    clearCount(@Body() data, @Req() req) {
      return this.service.clearCount(data,req.user.role);
    }

    @Roles('carrier','broker')
    @Post('hideRoom')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    hideRoomclearCount(@Body() data, @Req() req) {
      return this.service.hideRoom(data,req.user.role);
    }

    @Roles('carrier','broker')
    @Post('rooms')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    getRooms(@Body() data, @Req() req) {
      return this.service.getRooms(data, req.user.role);
    }
    @Roles('carrier','broker')
    @Get('posts')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    getPosts(@Req() req,@Query("otherPostId") otherPostId,@Query('myPostId') myPostId) {
      return this.service.getPosts(req.user._id,req.user.role,otherPostId,myPostId);
    }
    @Roles('carrier','broker')
    @Post('room')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    createRoom(@Body() data, @Req() req) {
      return this.service.createRoom(data, req.user._id, req.user.role);
    }

    @Roles('carrier','broker','admin','manager','supervisor')
    @Patch('room/booking')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    updateBookingStatus(@Body() data: UpdateBookingStatusDTO, @Req() req) {
      return this.service.updateBookingStatus(data, req.user);
    }

    @Roles('carrier','broker','admin','manager','supervisor')
    @Patch('room/workflow')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    updateBookingWorkflow(@Body() data: UpdateBookingWorkflowDTO, @Req() req) {
      return this.service.updateBookingWorkflow(data, req.user);
    }

    @Roles('carrier','broker')
    @Post('delete')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    deleteRoom(@Body() data, @Req() req) {
      return this.service.deleteRoom(data);
    }
    @Roles('carrier','broker')
    @Post('new-messages')
    @ApiOkResponse({ status: 200, type: MessageDTO })
    @ApiConsumes("multipart/form-data")
    newMessagesDot(@Body() data, @Req() req) {
      return this.service.newMessagesDot( req.user._id, req.user.role);
    }
    // @Roles('carrier','broker')
    // @Post('sortBid')
    // @ApiOkResponse({ status: 200, type: MessageDTO })
    // @ApiConsumes("multipart/form-data")
    // sortBid(@Body() data, @Req() req) {
    //   return this.service.sortBid(data);
    // }
}
