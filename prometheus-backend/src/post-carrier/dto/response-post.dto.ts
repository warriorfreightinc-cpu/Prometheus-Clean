import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { StopsCarrier } from "../interface/stops.interface";
import { OriginDestinationDTO } from "./origin-destination.dto";
import { ResponsecompanyDTO } from "./response-companyData.dto";
import { ResponseUserDataDTO } from "./response-userData.dto";
import { ResponseCarrierStopDTO } from "./stop.dto";


@Exclude()
export class ResponseCarrierPostDTO {

  @Expose()
  @ApiResponseProperty()
  @Transform((from: any) => {
    return from.obj._id
  }, { toClassOnly: false })
  readonly _id: string


  @Expose()
  @ApiResponseProperty()
  readonly companyId: string;


  @Expose()
  @ApiResponseProperty()
  readonly length: number;


  @Expose()
  @ApiResponseProperty()
  readonly capacity: string;

  @Expose()
  @ApiResponseProperty()
   capacitySearch: string;

   
  @Expose()
  @ApiResponseProperty()
   team: string;

   @Expose()
  @ApiResponseProperty()
   nonTanker: string;


  @Expose()
  @ApiResponseProperty()
  readonly weight: number;

  @Expose()
  @ApiResponseProperty()
  readonly equipment: Array<String>;

  @Expose()
  @ApiResponseProperty()
  readonly publisherId: string;

  @Expose()
  @ApiResponseProperty()
  readonly company: string;

  @Expose()
  @ApiResponseProperty()
  readonly comment: string;

  @Expose()
  @ApiResponseProperty()
  readonly refNum: string;

  @Expose()
  @ApiResponseProperty()
  readonly contact: string;

  // @Expose()
  // @ApiResponseProperty()
  // @Type(() => ResponseCarrierStopDTO)
  // readonly stops: ResponseCarrierStopDTO[];
  
  @Expose()
  @ApiResponseProperty()
  @Type(() => ResponseUserDataDTO)
  readonly userData: ResponseUserDataDTO;


  @Expose()
  @ApiResponseProperty()
  readonly watchlistData: Array<Object>;

  @Expose()
  @ApiResponseProperty()
  companyData: any;
  
  @Expose()
  @ApiResponseProperty()
  readonly watchlist: string;

  @Expose()
  @ApiResponseProperty()
  readonly origin: OriginDestinationDTO;

  @Expose()
  @ApiResponseProperty()
  readonly destination: OriginDestinationDTO;

  @Expose()
  @ApiResponseProperty()
  readonly distance: Number;

  @Expose()
  @ApiResponseProperty()
 dho: Number;

  @Expose()
  @ApiResponseProperty()
 dhd: Number;

  @Expose()
  @ApiResponseProperty()
  readonly dhoRadius: Number;

  @Expose()
  @ApiResponseProperty()
  readonly dhdRadius: Number;

  @Expose()
  @ApiResponseProperty()
  readonly startDate: Date;

  @Expose()
  @ApiResponseProperty()
  readonly endDate: Date;

//  @Expose()
//   @ApiResponseProperty()
//   readonly date: Date;

  @Expose()
  @ApiResponseProperty()
  readonly publishedAt: Date;

  @Expose()
  @ApiResponseProperty()
  readonly timeElapsed: Date;
}
