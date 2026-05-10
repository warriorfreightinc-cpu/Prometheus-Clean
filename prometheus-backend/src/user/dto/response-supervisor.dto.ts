import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform } from "class-transformer";
import { UserRoleEnum } from "../enums/user-roles.enum";


@Exclude()
export class ResponseSupervisorDTO {
  @Expose()
  @ApiResponseProperty()
  @Transform((from: any) => {
    return from.obj._id
  }, { toClassOnly: false })
  readonly _id: string


  @Expose()
  @ApiResponseProperty()
  readonly companyId: string;


  @Expose()
  @ApiResponseProperty()
  readonly email: string;

  @Expose()
  @ApiResponseProperty()
  readonly role: UserRoleEnum;

  @Expose()
  @ApiResponseProperty()
  readonly firstName: string;

  @Expose()
  @ApiResponseProperty()
  readonly lastName: string;

  @Expose()
  @ApiResponseProperty()
  readonly avatar: string;

  @Expose()
  @ApiResponseProperty()
  readonly phone: string;

  @Expose()
  @ApiResponseProperty()
  readonly isActive: boolean;

  @Expose()
  @ApiResponseProperty()
  readonly contactEmail: string;

  @Expose()
  @ApiResponseProperty()
  readonly companyData: string;
}
