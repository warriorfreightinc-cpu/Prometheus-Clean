import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiConsumes, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/shared/decorators/roles.decorator';
import { CreateCarrierPostDTO } from './dto/create-post.dto';
import { ResponseCarrierPostDTO } from './dto/response-post.dto';
import { SearchDTO } from './dto/search.dto';
import { LoadTruckSearchDTO } from './dto/truck-load-search.dto';
import { UpdateCarrierPostDTO } from './dto/update-post.dto';
import { PostCarrierService } from './post.service';
@ApiTags("carrierPosts")
@Controller('carrier')
export class PostCarrierController {
  constructor(private readonly service: PostCarrierService) { }

  @Roles('carrier')
  @Post()
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  createPost(@Body() postData: CreateCarrierPostDTO, @Req() req): Promise<ResponseCarrierPostDTO> {
    return this.service.createPost(postData, req.user.companyId, req.user._id);
  }

  @Roles('carrier')
  @Post('watchlist')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  addToWatchlist(@Body() postData, @Req() req) {
    return this.service.addToWatchlist(postData, req.user.companyId, req.user._id);
  }
  @Roles('carrier')
  @Patch('notes/:postId')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  addToNotes(@Body() note, @Req() req, @Param() postId) {
    return this.service.addNote(note, req.user.companyId, postId, req.user.name, req.user.lastName);
  }

  @Roles('carrier')
  @Get('notes/:postId')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  getNotes(@Req() req, @Param() postId) {
    return this.service.getNotes(req.user.companyId, postId.postId);
  }
  @Roles('carrier')
  @Delete('watchlist/:id')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  deleteFromWatchlist(@Param() id, @Req() req) {
    return this.service.deleteFromWatchlist(id.id, req.user.companyId);
  }

  // @Roles('carrier','broker')
  // @Get('watchlist')
  // @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  // @ApiConsumes("multipart/form-data")
  // getMyCompany(@Req() req) {
  //   return this.service.getMyCompanyPins(req.user.companyId,req);
  // }

  @Roles('carrier', 'broker')
  @Get('companyPins')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  getMyCompanyPinst(@Req() req) {
    return this.service.getMyCompanyPins(req.user.companyId, req.user._id);
  }

  @Roles('carrier', 'broker')
  @Get('watchlist/messages/:postId')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  getMessages(@Param('postId') postId, @Req() req) {
    return this.service.getMessages(postId, req.user.companyId, req.user._id);
  }

  @Roles('carrier', 'broker')
  @Put('watchlist/messages/:postId')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  createMessage(@Param('postId') postId, @Req() req, @Body() messageData) {
    return this.service.createMessage(postId, req.user.companyId, messageData, req.user.name, req.user.lastName);
  }

  @Roles('carrier')
  @Patch()
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  editPost(@Body() editData: UpdateCarrierPostDTO, @Req() req): Promise<ResponseCarrierPostDTO> {
    return this.service.editPost(editData, req.user._id);
  }

  @Roles('carrier')
  @Patch('update/:id')
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  udpatePostTime(@Param() id, @Req() req, @Body() post: CreateCarrierPostDTO) {
    return this.service.updatePostTime(id, req.user._id, post, req.user.companyId);
  }
  @Roles('carrier')
  @Patch('updateDHO')
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  udpateDHO(@Body() data) {
    return this.service.updateDHO(data);
  }

  @Roles('carrier')
  @Patch('updateCapacity')
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  udpateCapacitySearch(@Body() data) {
    return this.service.updateCapacitySearch(data);
  }
  @Roles('carrier')
  @Patch('updateDHD')
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  udpateDHD(@Body() data) {
    return this.service.updateDHD(data);
  }

  @Roles('carrier')
  @Delete(':id')
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  deletePost(@Param() id, @Req() req) {
    return this.service.deletePost(id.id, req.user._id);
  }


  @Post('search')
  @ApiOkResponse({ status: 200, type: ResponseCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  search(@Body() data: SearchDTO, @Req() req): Promise<ResponseCarrierPostDTO[]> {
    return this.service.search(data, req.user._id);
  }

  @Roles('broker', 'carrier')
  @Post('truckSearch')
  @ApiOkResponse({ status: 200, type: LoadTruckSearchDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  truckSearch(@Body() data: LoadTruckSearchDTO, @Req() req) {
    return this.service.truckSearch(data, req.user._id);
  }

  @Roles('broker', 'carrier')
  @Get('post/:id')
  @ApiConsumes("multipart/form-data")
  getSinglePost(@Param('id') postId): Promise<ResponseCarrierPostDTO> {
    return this.service.getSinglePost(postId);
  }

  @Get(':type/:id')
  @ApiOkResponse({ status: 200, type: CreateCarrierPostDTO })
  @ApiConsumes("multipart/form-data")
  @ApiExcludeEndpoint()
  getPosts(@Param('id') userId: string, @Param('type') type: string, @Req() req): Promise<ResponseCarrierPostDTO[]> {
    return this.service.getPosts(userId, type, req.user.companyId);
  }

  @Post('microservice/deleteOldPosts')
  @ApiExcludeEndpoint()
  deleteOldPosts() {
    return this.service.deleteOldPosts();
  }
}
