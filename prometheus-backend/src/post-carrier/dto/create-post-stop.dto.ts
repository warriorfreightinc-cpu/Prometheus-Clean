import { ApiProperty, ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { IsBoolean, IsString } from "class-validator";



export class CreateStopDTO {

  @ApiProperty()
  readonly type: string;

  @ApiProperty()
  readonly place: Object;


  @ApiProperty()
  readonly date: Date;

  @IsBoolean()
  @ApiProperty()
  readonly driverWork: Boolean;

}
