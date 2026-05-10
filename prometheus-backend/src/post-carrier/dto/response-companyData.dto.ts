import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { StopsCarrier } from "../interface/stops.interface";
import { OriginDestinationDTO } from "./origin-destination.dto";
import { ResponseCarrierStopDTO } from "./stop.dto";


@Exclude()
export class ResponsecompanyDTO {

  @Expose()
  @ApiResponseProperty()
  @Transform((from: any) => {
    return from.obj._id
  }, { toClassOnly: false })
  readonly _id: string


}
