import { ApiProperty, ApiResponseProperty } from "@nestjs/swagger";
import { Expose, Transform, Type } from "class-transformer";
import { OriginDestinationDTO } from "src/post-carrier/dto/origin-destination.dto";


export class UserDTO {

    @ApiProperty()
    readonly userId: string;
  
    @ApiProperty()
    readonly messages: [];
  
  }
  
  export class PostDTO{
    @Expose()
    @ApiResponseProperty()
    @Transform((from: any) => {
      return from.obj._id
    }, { toClassOnly: false })
    readonly _id: string

    @Expose()
  @ApiResponseProperty()
  readonly origin: OriginDestinationDTO;
  }

export class RoomDTO {
    @Expose()
    @ApiResponseProperty()
    readonly carrierPostId: string;
  
    @Expose()
    @ApiResponseProperty()
    readonly brokerPostId: string;
  
    @Expose()
    @ApiResponseProperty()
    readonly messages: [];

    @Expose()
    @ApiResponseProperty()
    @Type(() => PostDTO)
    readonly postData: PostDTO;


}
