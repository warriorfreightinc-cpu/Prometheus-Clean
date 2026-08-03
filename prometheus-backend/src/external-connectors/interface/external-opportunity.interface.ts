import { Document } from "mongoose";
import { ExternalFreightKind } from "../dto/external-connector.dto";

export interface ExternalOpportunity extends Document {
  companyId: string;
  integrationId: string;
  provider: string;
  providerLabel: string;
  externalId: string;
  kind: ExternalFreightKind;
  status: "active" | "removed";
  origin: Record<string, unknown>;
  destination?: Record<string, unknown>;
  pickup?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  equipment: string[];
  length?: number;
  weight?: number;
  commodity?: string;
  hazmat?: boolean | null;
  nonHazmat?: boolean;
  hazmatClass?: string;
  unNumbers?: string[];
  capacity?: string;
  rate?: number;
  currency?: string;
  specialNotes?: string;
  contact?: Record<string, unknown>;
  booking?: Record<string, unknown>;
  sourceRequestId?: string;
  sourceUpdatedAt?: Date;
  publishedAt?: Date;
  lastSeenAt: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
