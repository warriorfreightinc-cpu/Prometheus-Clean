import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose } from "class-transformer";


@Exclude()
export class ResponseBrokerStopDTO {

  @Expose()
  @ApiResponseProperty()
  readonly type: string;

  @Expose()
  @ApiResponseProperty()
  readonly comment: string;

  @Expose()
  @ApiResponseProperty()
  readonly place: Object;

  @Expose()
  @ApiResponseProperty()
  readonly endDate: Date;

  @Expose()
  @ApiResponseProperty()
  readonly startDate: Date;

}
