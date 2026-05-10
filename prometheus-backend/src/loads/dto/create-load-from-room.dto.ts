import { IsOptional, IsString } from "class-validator";

export class CreateLoadFromRoomDTO {
  @IsString()
  readonly brokerPostId: string;

  @IsString()
  readonly carrierPostId: string;

  @IsOptional()
  @IsString()
  readonly loadNumber?: string;

  @IsOptional()
  @IsString()
  readonly driverName?: string;

  @IsOptional()
  @IsString()
  readonly truckLabel?: string;

  @IsOptional()
  @IsString()
  readonly summary?: string;
}
