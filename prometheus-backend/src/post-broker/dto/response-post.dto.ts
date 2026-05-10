import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { OriginDestinationDTO } from "./origin-destination.dto";
import { ResponseUserDataDTO } from "./response-userData.dto";
import { ResponseBrokerStopDTO } from "./stop.dto";


@Exclude()
export class ResponseBrokerPostDTO {

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
  readonly companyDot: string;

  @Expose()
  @ApiResponseProperty()
  readonly watchlist: string;

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
  readonly weight: number;

  @Expose()
  @ApiResponseProperty()
  readonly equipment: Array<string>;

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
  readonly publisherId: string;

  @Expose()
  @ApiResponseProperty()
  readonly company: string;

  @Expose()
  @ApiResponseProperty()
  readonly contact: string;

  @Expose()
  @ApiResponseProperty()
  readonly comment: string;

  @Expose()
  @ApiResponseProperty()
  readonly bookUrl: string;

  @Expose()
  @ApiResponseProperty()
  readonly comments: any;

  @Expose()
  @ApiResponseProperty()
  readonly refNum: string;

  @Expose()
  @ApiResponseProperty()
  @Type(() => ResponseBrokerStopDTO)
  readonly stops: ResponseBrokerStopDTO[];

  @Expose()
  @ApiResponseProperty()
  @Type(() => ResponseUserDataDTO)
  readonly userData: ResponseUserDataDTO;

  @Expose()
  @ApiResponseProperty()
  readonly stopsDistances: number[];

  @Expose()
  @ApiResponseProperty()
  companyData: any;

  @Expose()
  @ApiResponseProperty()
  readonly publishedAt: Date;

  @Expose()
  @ApiResponseProperty()
  readonly rate: Number;

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
  readonly tankerEndorsement: Boolean;
  
  @Expose()
  @ApiResponseProperty()
  readonly nonHazmat: Boolean;

  @Expose()
  @ApiResponseProperty()
  readonly team: Boolean;

  @Expose()
  @ApiResponseProperty()
  readonly companyMc: string;

  @Expose()
  @ApiResponseProperty()
  readonly companyName: string;

  @Expose()
  @ApiResponseProperty()
  readonly companyFirstName: string;

  @Expose()
  @ApiResponseProperty()
  readonly companyLastName: string;

  @Expose()
  @ApiResponseProperty()
  readonly companyPhone: string;

  @Expose()
  @ApiResponseProperty()
  readonly companyEmail: string;
}
