import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform } from "class-transformer";
@Exclude()
export class ResponseCompanyDTO {

  @Expose()
  @ApiResponseProperty()
  @Transform((from: any) => {
    return from.obj._id
  }, { toClassOnly: false })
  readonly _id: string


}
