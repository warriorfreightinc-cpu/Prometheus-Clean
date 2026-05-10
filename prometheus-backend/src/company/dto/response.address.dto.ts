import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform } from "class-transformer";


@Exclude()
export class ResponseAddressDTO {

  
  @ApiResponseProperty()
  @Expose()
  readonly country: string;

  @ApiResponseProperty()
  @Expose()
  readonly city: string;

  @ApiResponseProperty()
  @Expose()
  readonly street: string;
  
  @ApiResponseProperty()
  @Expose()
  readonly zip: string;

  @ApiResponseProperty()
  @Expose()
  readonly state: string;
  
  
}