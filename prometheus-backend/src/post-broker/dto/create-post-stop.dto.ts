import { ApiProperty } from "@nestjs/swagger";



export class CreateStopDTO {

  @ApiProperty()
  readonly type: string;

  @ApiProperty()
  readonly place: Object;


  @ApiProperty()
  readonly startDate: Date;

  @ApiProperty()
  readonly endDate: Date;
}
