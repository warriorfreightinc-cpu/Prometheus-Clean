import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

const verificationSources = ["manual", "highway", "mycarrierpacket", "truckstop", "other"];
const restoreStatuses = ["draft", "pending_review", "approved_waiting_setup", "active", "inactive"];

export class VerifyOnboardingDocumentDTO {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  readonly expirationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly notes?: string;

  @ApiPropertyOptional({ enum: verificationSources })
  @IsOptional()
  @IsIn(verificationSources)
  readonly source?: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
}

export class RejectOnboardingDocumentDTO {
  @ApiProperty()
  @IsString()
  readonly reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly notes?: string;
}

export class RequestCorrectionDTO {
  @ApiProperty()
  @IsString()
  readonly message: string;
}

export class InactivateCompanyDTO {
  @ApiProperty()
  @IsString()
  readonly reason: string;
}

export class RestoreCompanyDTO {
  @ApiProperty({ enum: restoreStatuses })
  @IsIn(restoreStatuses)
  readonly status: "draft" | "pending_review" | "approved_waiting_setup" | "active" | "inactive";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly reason?: string;
}

export class SoftDeleteCompanyDTO {
  @ApiProperty()
  @IsString()
  readonly reason: string;
}

export class ResendSetupEmailDTO {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly includeContactPerson?: boolean;
}

export class SubmitCompanyOnboardingDTO {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly requestedSeats?: number;
}
