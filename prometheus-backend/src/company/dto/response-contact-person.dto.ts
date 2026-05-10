import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose } from "class-transformer";


@Exclude()
export class ResponseContactPersonDTO {

  
  @ApiResponseProperty()
  @Expose()
  readonly firstName: string;

  @ApiResponseProperty()
  @Expose()
  readonly lastName: string;

  @ApiResponseProperty()
  @Expose()
  readonly phone: string;

  @ApiResponseProperty()
  @Expose()
  readonly verificationPhone: string;
  
  @ApiResponseProperty()
  @Expose()
  readonly email: string;

  @ApiResponseProperty()
  @Expose()
  readonly role: string;
}
