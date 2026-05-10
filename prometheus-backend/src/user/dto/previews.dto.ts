import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose } from "class-transformer";


@Exclude()
export class ResponsePreviewsDTO {

  @Expose()
  @ApiResponseProperty()
  readonly previews: Array<String>;

}

