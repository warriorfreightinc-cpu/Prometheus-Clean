import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
@Exclude()
export class userDataDto {

  @Expose()
  @ApiResponseProperty()
  @Transform((from: any) => {
    return from.obj._id
  }, { toClassOnly: false })
  readonly _id: string

  @Expose()
  @ApiResponseProperty()
  readonly firstName: string;

  @Expose()
  @ApiResponseProperty()
  readonly lastName: string;
  
  @Expose()
  @ApiResponseProperty()
  readonly phone: string;

  @Expose()
  @ApiResponseProperty()
  readonly contactEmail: string;
}
@Exclude()
export class ResponseBrokerCompanyPins {

  @Expose()
  @ApiResponseProperty()
  @Transform((from: any) => {
    return from.obj._id
  }, { toClassOnly: false })
  readonly _id: string

  @Expose()
  @ApiResponseProperty()
  readonly origin: any;

  @Expose()
  @ApiResponseProperty()
  readonly destination: any;

  @Expose()
    @Type(() => userDataDto)
  @ApiResponseProperty()
  readonly userData: userDataDto;

}
