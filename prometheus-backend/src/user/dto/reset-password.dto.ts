import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

export class ResetPasswordDTO {
  @ApiPropertyOptional({ description: "current email or encoded email" })
  @IsString()
  @IsOptional()
  @Transform((from: any) => {
    return from.obj.email.toLowerCase()
  })
  readonly email: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readonly password: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readonly currentPassword: string;
}
