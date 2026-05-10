import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Validate } from "class-validator";
import { UserRoleEnum } from "../enums/user-roles.enum";

import { EmailExists } from "src/shared/validarors/existing-email.validator";

export class CreateUserDTO {
 
  @IsEmail()
  @ApiProperty()
  @Transform((from: any) => {
    return from.obj.email.toLowerCase()
  })
  @Validate(EmailExists)
  readonly email: string;

  @IsString()
  @ApiProperty()
  readonly phone: string;


  @IsString()
  @ApiProperty()
  readonly firstName: string;

  @IsString()
  @ApiProperty()
  readonly lastName: string;

  @IsString()
  @ApiProperty()
  readonly role: UserRoleEnum;

  @IsOptional()
  @IsEmail()
  @ApiProperty()
  readonly contactEmail: string;

  
}
