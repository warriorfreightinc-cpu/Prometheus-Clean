import { IsIn, IsOptional, IsString } from "class-validator";

export class RequestLoadAccessDTO {
  @IsOptional()
  @IsString()
  readonly note?: string;
}

export class DecideLoadAccessDTO {
  @IsIn(["approve", "reject"])
  readonly action: "approve" | "reject";

  @IsOptional()
  @IsString()
  readonly note?: string;
}
