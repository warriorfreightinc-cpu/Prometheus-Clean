import { ApiProperty } from "@nestjs/swagger";



export class OriginDestinationDTO {

  @ApiProperty()
  readonly place: Object;

  @ApiProperty()
  readonly location: {type:string,coordinates:{lat:number,lng:number}};

  @ApiProperty()
  pinLocation: {type:string,coordinates:{lat:number,lng:number}};

  @ApiProperty()
  readonly type: string;
}
