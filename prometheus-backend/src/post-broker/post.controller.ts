import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiConsumes, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/shared/decorators/roles.decorator';
import { CreateBrokerPostDTO } from './dto/create-post.dto';
import { ResponseBrokerPostDTO } from './dto/response-post.dto';
import { SearchDTO } from './dto/search.dto';
import { LoadTruckSearchDTO } from './dto/truck-load-search.dto';
import { UpdateBrokerPostDTO } from './dto/update-post.dto';
import { PostBrokerService } from './post.service';
@ApiTags("brokerPosts")
@Controller('broker')
export class PostBrokerController {
  constructor(private readonly service: PostBrokerService) { }

  @Roles('broker')
  @Post()
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  createPost(@Body() postData: CreateBrokerPostDTO, @Req() req): Promise<ResponseBrokerPostDTO> {
    return this.service.createPost(postData, req.user.companyId, req.user._id);
  }

  @Roles('carrier')
  @Post('search')
  @ApiExcludeEndpoint()
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  search(@Body() data: SearchDTO, @Req() req): Promise<ResponseBrokerPostDTO[]> {
    return this.service.search(data, req.user._id);
  }

  @Roles('carrier', 'broker')
  @Post('watchlist')
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  addToWatchlist(@Body() postData, @Req() req) {
    return this.service.addToWatchlist(postData, req.user.companyId, req.user._id);
  }

  @Roles('broker')
  @Delete('watchlist/:id')
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  deleteFromWatchlist(@Param() id, @Req() req) {
    return this.service.deleteFromWatchlist(id.id, req.user.companyId);
  }

  @Roles('broker', 'carrier')
  @Get('watchlist')
  @ApiExcludeEndpoint()
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  getWatchlist(@Req() req) {

    return this.service.getWatchlist(req.user.companyId);
  }
  @Roles('broker', 'carrier')
  @Get('watchlist/messages/:postId')
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  getMessages(@Param('postId') postId, @Req() req) {
    return this.service.getMessages(postId, req.user.companyId, req.user._id);
  }
  @Roles('carrier', 'broker')
  @Get('companyPins')
  @ApiExcludeEndpoint()
  @ApiConsumes("multipart/form-data")
  getMyCompanyPinst(@Req() req) {

    return this.service.getMyCompanyPins(req.user.companyId, req.user._id);
  }
  @Roles('broker')
  @Patch('notes/:postId')
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  addToNotes(@Body() note, @Req() req, @Param() postId) {
    return this.service.addNote(note, req.user.companyId, postId, req.user.name, req.user.lastName);
  }

  @Roles('broker')
  @Get('notes/:postId')
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  getNotes(@Req() req, @Param() postId) {
    return this.service.getNotes(req.user.companyId, postId.postId);
  }

  @Roles('carrier', 'broker')
  @Put('watchlist/messages/:postId')
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  createMessage(@Param('postId') postId, @Req() req, @Body() messageData) {
    return this.service.createMessage(postId, req.user.companyId, messageData, req.user.name, req.user.lastName);
  }

  @Roles('broker')
  @Patch()
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  editPost(@Body() editData: UpdateBrokerPostDTO, @Req() req): Promise<ResponseBrokerPostDTO> {
    return this.service.editPost(editData, req.user._id);
  }

  @Roles('broker')
  @Patch('update/:id')
  @ApiOkResponse({ status: 200, type: CreateBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  udpatePostTime(@Param() id, @Req() req, @Body() post: CreateBrokerPostDTO) {
    return this.service.updatePostTime(id, req.user._id, post, req.user.companyId);
  }

  @Roles('broker')
  @Patch('updateDHD')
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  udpateDHO(@Body() value) {
    return this.service.updateDHD(value);
  }


  @Roles('broker')
  @Patch('updateDHO')
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  udpateDHD(@Body() value) {
    return this.service.updateDHO(value);
  }

  @Roles('broker')
  @Patch('updateCapacity')
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  udpateCapacitySearch(@Body() value) {
    return this.service.updateCapacitySearch(value);
  }

  @Roles('broker')
  @Delete(':id')
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  deletePost(@Param() id, @Req() req) {
    return this.service.deletePost(id.id, req.user._id);
  }

  @Roles('broker', 'carrier')
  @Post('loadSearch')
  @ApiOkResponse({ status: 200, type: LoadTruckSearchDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  loadSearch(@Body() data: LoadTruckSearchDTO, @Req() req) {
    return this.service.loadSearch(data, req.user._id);
  }

  @Roles('carrier', 'broker')
  @Get('post/:id')
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @HttpCode(HttpStatus.OK)
  getSinglePost(@Param('id') postId): Promise<ResponseBrokerPostDTO> {
    return this.service.getSinglePost(postId);
  }

  @Roles('broker')
  @Get(':type/:id')
  @ApiOkResponse({ status: 200, type: ResponseBrokerPostDTO })
  @ApiConsumes("multipart/form-data")
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  getPosts(@Param('id') userId: string, @Param('type') type: string, @Req() req): Promise<ResponseBrokerPostDTO[]> {
    const companyId = req.user.companyId.toString()
    return this.service.getPosts(userId, type, companyId);
  }

  @Post('microservice/deleteOldPosts')
  @ApiExcludeEndpoint()
  deleteOldPosts() {

    return this.service.deleteOldPosts();
  }
}


