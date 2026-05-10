import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";
export class CreateAdminDTO {
 
  @IsEmail()
  @ApiProperty()
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

  @IsString()
  @MinLength(8)
  @ApiProperty()
  readonly password: string;




  
}
