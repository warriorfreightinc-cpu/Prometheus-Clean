import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose } from "class-transformer";

@Exclude()
export class ResponseSuccessDTO {
  @Expose()
  @ApiResponseProperty()
  readonly message: string;
}
