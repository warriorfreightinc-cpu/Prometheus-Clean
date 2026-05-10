import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { StopsCarrier } from "../interface/stops.interface";
import { OriginDestinationDTO } from "./origin-destination.dto";
import { ResponseCarrierStopDTO } from "./stop.dto";


@Exclude()
export class ResponseUserDataDTO {
  @Expose()
  @ApiResponseProperty()
  firstName: String;

  @Expose()
  @ApiResponseProperty()
  readonly lastName: String;

  @Expose()
  @ApiResponseProperty()
  readonly companyId: String;
}
