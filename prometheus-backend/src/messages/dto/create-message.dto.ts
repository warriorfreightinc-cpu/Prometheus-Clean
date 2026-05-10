import { ApiProperty } from "@nestjs/swagger";



export class MessageDTO {

  @ApiProperty()
  readonly text: string;

  @ApiProperty()
  readonly roomId: string;
}
