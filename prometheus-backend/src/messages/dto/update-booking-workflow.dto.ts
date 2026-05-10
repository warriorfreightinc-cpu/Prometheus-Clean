import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

export type BookingWorkflowAction =
  | "setup"
  | "driver"
  | "contact"
  | "tracking"
  | "delivered"
  | "cancelled"
  | "readyToBill";

export class UpdateBookingWorkflowDTO {
  @IsString()
  readonly brokerPostId: string;

  @IsString()
  readonly carrierPostId: string;

  @IsIn(["setup", "driver", "contact", "tracking", "delivered", "cancelled", "readyToBill"])
  readonly action: BookingWorkflowAction;

  @IsOptional()
  @IsString()
  readonly setupProvider?: string;

  @IsOptional()
  @IsString()
  readonly setupLabel?: string;

  @IsOptional()
  @IsString()
  readonly setupSource?: string;

  @IsOptional()
  @IsString()
  readonly driverId?: string;

  @IsOptional()
  @IsString()
  readonly driverName?: string;

  @IsOptional()
  @IsString()
  readonly truckLabel?: string;

  @IsOptional()
  @IsBoolean()
  readonly contactSaved?: boolean;

  @IsOptional()
  @IsString()
  readonly contactName?: string;

  @IsOptional()
  @IsString()
  readonly contactEmail?: string;

  @IsOptional()
  @IsString()
  readonly trackingProvider?: string;

  @IsOptional()
  @IsString()
  readonly trackingSource?: string;

  @IsOptional()
  @IsBoolean()
  readonly trackingShared?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly delivered?: boolean;

  @IsOptional()
  @IsString()
  readonly cancellationMode?: string;

  @IsOptional()
  @IsString()
  readonly cancellationNote?: string;

  @IsOptional()
  @IsBoolean()
  readonly readyToBill?: boolean;
}
