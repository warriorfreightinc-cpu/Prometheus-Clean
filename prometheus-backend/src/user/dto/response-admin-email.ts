import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform } from "class-transformer";


@Exclude()
export class ResponseAdminEmailDTO {

  @Expose()
  @ApiResponseProperty()
  @Transform((from: any) => {
    return from.obj.email.toLowerCase()
  })
  readonly email: string;


}
