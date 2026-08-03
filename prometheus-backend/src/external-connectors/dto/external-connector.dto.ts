import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export type ExternalFreightKind = "load" | "truck";
export type ExternalFreightStatus = "available" | "removed";

export class ExternalLocationDTO {
  @IsOptional()
  @IsString()
  readonly city?: string;

  @IsOptional()
  @IsString()
  readonly state?: string;

  @IsOptional()
  @IsString()
  readonly postalCode?: string;

  @IsOptional()
  @IsString()
  readonly country?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  readonly latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  readonly longitude?: number;
}

export class ExternalAppointmentWindowDTO {
  @IsOptional()
  @IsISO8601()
  readonly earliest?: string;

  @IsOptional()
  @IsISO8601()
  readonly latest?: string;

  @IsOptional()
  @IsString()
  readonly timeZone?: string;
}

export class ExternalContactDTO {
  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @IsString()
  readonly company?: string;

  @IsOptional()
  @IsString()
  readonly email?: string;

  @IsOptional()
  @IsString()
  readonly phone?: string;
}

export class ExternalBookingDTO {
  @IsOptional()
  @IsIn(["api", "email", "link", "phone", "manual"])
  readonly mode?: "api" | "email" | "link" | "phone" | "manual";

  @IsOptional()
  @IsString()
  readonly url?: string;

  @IsOptional()
  @IsString()
  readonly email?: string;

  @IsOptional()
  @IsString()
  readonly phone?: string;
}

export class ExternalFreightItemDTO {
  @IsString()
  readonly externalId: string;

  @IsIn(["load", "truck"])
  readonly kind: ExternalFreightKind;

  @IsOptional()
  @IsIn(["available", "removed"])
  readonly status?: ExternalFreightStatus;

  @IsObject()
  @ValidateNested()
  @Type(() => ExternalLocationDTO)
  readonly origin: ExternalLocationDTO;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExternalLocationDTO)
  readonly destination?: ExternalLocationDTO;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExternalAppointmentWindowDTO)
  readonly pickup?: ExternalAppointmentWindowDTO;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExternalAppointmentWindowDTO)
  readonly delivery?: ExternalAppointmentWindowDTO;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly equipment?: string[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  readonly lengthFeet?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  readonly weightLbs?: number;

  @IsOptional()
  @IsString()
  readonly commodity?: string;

  @IsOptional()
  @IsBoolean()
  readonly hazmat?: boolean;

  @IsOptional()
  @IsString()
  readonly hazmatClass?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly unNumbers?: string[];

  @IsOptional()
  @IsString()
  readonly capacity?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  readonly rate?: number;

  @IsOptional()
  @IsString()
  readonly currency?: string;

  @IsOptional()
  @IsString()
  readonly specialNotes?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExternalContactDTO)
  readonly contact?: ExternalContactDTO;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExternalBookingDTO)
  readonly booking?: ExternalBookingDTO;

  @IsOptional()
  @IsISO8601()
  readonly sourceUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  readonly expiresAt?: string;
}

export class ExternalFreightBatchDTO {
  @IsOptional()
  @IsString()
  readonly sourceRequestId?: string;

  @IsOptional()
  @IsISO8601()
  readonly sentAt?: string;

  @IsOptional()
  @IsBoolean()
  readonly fullSnapshot?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExternalFreightItemDTO)
  readonly items: ExternalFreightItemDTO[];
}

export interface ExternalOpportunitySearch {
  kind: ExternalFreightKind;
  hazmatMode?: "hazmat" | "nonHazmat";
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  maxAgeHours?: number;
  maxWeight?: number | null;
  maxLength?: number | null;
  capacity?: "full" | "partial" | "any" | null;
  equipmentCodes?: string[];
  limit?: number;
}
