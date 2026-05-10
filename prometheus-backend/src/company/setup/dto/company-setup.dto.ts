import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Min } from "class-validator";

export class LocalActivateCompanyDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly quantity: number;
}

export interface CompanySetupStatusDTO {
  status: string;
  requestedSeats: number;
  paidSeats: number;
  activeUsers: number;
  canLocalActivate: boolean;
  company: any;
}
