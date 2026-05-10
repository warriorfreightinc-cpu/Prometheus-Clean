import { ApiProperty, ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { IsBoolean, IsString } from "class-validator";



export class OriginDestinationDTO {

  @ApiProperty()
  readonly place: string;

  @ApiProperty()
  readonly location: {type:string,coordinates:{lat:number,lng:number}};

  @ApiProperty()
  type: string;

  @ApiProperty()
  pinLocation: {type:string,coordinates:{lat:number,lng:number}};
}
