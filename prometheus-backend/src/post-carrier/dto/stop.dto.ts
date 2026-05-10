import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";


@Exclude()
export class ResponseCarrierStopDTO {

  @Expose()
  @ApiResponseProperty()
  readonly type: string;


  @Expose()
  @ApiResponseProperty()
  readonly place: Object;

  @Expose()
  @ApiResponseProperty()
  @Type(() => Date)
  readonly startDate: Date;

  @Expose()
  @ApiResponseProperty()
  @Type(() => Date)
  readonly endDate: Date;

  @Expose()
  @ApiResponseProperty()
  readonly driverWork: Boolean;

}
