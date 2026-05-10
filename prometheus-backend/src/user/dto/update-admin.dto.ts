import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";


export class UpdateAdminDTO {
 
  @IsEmail()
  @ApiProperty()
  @IsOptional()
  @Transform((from: any) => {
    return from.obj.email.toLowerCase()
  })
  readonly email?: string;

  @IsString()
  @ApiProperty()
  @IsOptional()
  readonly phone?: string;


  @IsString()
  @ApiProperty()
  @IsOptional()
  readonly firstName?: string;

  @IsString()
  @ApiProperty()
  @IsOptional()
  readonly lastName?: string;

  @IsString()
  @MinLength(8)
  @ApiProperty()
  @IsOptional()
  readonly password?: string;




  
}
