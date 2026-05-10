import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateBookingStatusDTO {
  @IsString()
  readonly brokerPostId: string;

  @IsString()
  readonly carrierPostId: string;

  @IsIn(["approve", "cancel"])
  readonly action: "approve" | "cancel";

  @IsOptional()
  @IsString()
  readonly note?: string;
}
