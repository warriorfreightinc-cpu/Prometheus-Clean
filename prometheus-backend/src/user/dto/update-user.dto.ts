import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, Validate } from "class-validator";
import { EmailExists } from "src/shared/validarors/existing-email.validator";
import { UserRoleEnum } from "../enums/user-roles.enum";
import { EmailExistsValidator } from "src/shared/decorators/email-exists.decorator";



export class UpdateUserDTO {
 
  @IsString()
  @ApiProperty()
  readonly _id: string;

  @IsEmail()
  @ApiProperty()
  @EmailExistsValidator({ message: 'Email already exists', idField: 'phone' })
  @Transform((from: any) => {
    return from.obj.email.toLowerCase()
  })
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

  @IsOptional()
  @ApiProperty()
  readonly contactEmail:string

  @IsString()
  @ApiProperty()
  @IsOptional()
  readonly role: UserRoleEnum;

  @IsBoolean()
  @ApiProperty()
  @IsOptional()
  readonly subscriptionEmail: boolean;
 
}
