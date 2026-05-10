import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class ChatbbThreadDTO {
  @IsString()
  @ApiProperty()
  readonly carrierPostId: string;

  @IsString()
  @ApiProperty()
  readonly brokerPostId: string;
}

export class ChatbbMessageDTO extends ChatbbThreadDTO {
  @IsString()
  @MaxLength(4000)
  @ApiProperty()
  readonly prompt: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @ApiPropertyOptional()
  readonly previewOnly?: boolean;
}
