import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose } from "class-transformer";


@Exclude()
export class ResponseHistoryDTO {

  
  @ApiResponseProperty()
  @Expose()
  readonly history: string;

}