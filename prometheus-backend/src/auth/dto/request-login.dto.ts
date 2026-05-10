import { IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class RequestLogInDTO {
  @ApiProperty({ description: "email" })
  @MaxLength(60)
  @Transform((from: any) => {
    return from.obj.email.toLowerCase()
  })
  readonly email: string;

  @ApiProperty({ description: "user password" })
  @IsString()
  @MaxLength(50)
  readonly password: string;
}
