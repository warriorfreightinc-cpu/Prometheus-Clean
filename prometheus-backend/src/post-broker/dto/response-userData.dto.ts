import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose} from "class-transformer";


@Exclude()
export class ResponseUserDataDTO {
  @Expose()
  @ApiResponseProperty()
  firstName: String;

  @Expose()
  @ApiResponseProperty()
  readonly lastName: String;

  @Expose()
  @ApiResponseProperty()
  readonly companyId: String;
}
