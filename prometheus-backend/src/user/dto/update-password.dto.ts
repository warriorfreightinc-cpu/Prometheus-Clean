import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdatePasswordDTO {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readonly currentPassword: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readonly password: string;

}
