import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateLoadDTO {
  @IsOptional()
  @IsIn(["active", "library", "readyToBill", "archived"])
  readonly status?: "active" | "library" | "readyToBill" | "archived";

  @IsOptional()
  @IsString()
  readonly statusNote?: string;

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
