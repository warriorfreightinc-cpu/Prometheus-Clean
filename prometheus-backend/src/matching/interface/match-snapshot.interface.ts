import { Document } from "mongoose";
import {
  EquipmentCompatibility,
  MatchOpportunityTier,
  PermissionStatus,
} from "../hazmat-match-classifier";

export type MatchSourcePostType = "carrierPost" | "brokerPost";

export interface MatchScoreBreakdown {
  laneFit: number;
  equipmentFit: number;
  weightFit: number;
  freshnessFit: number;
  rateFit: number;
}

export interface MatchRouteMetrics {
  originDeadheadMiles: number | null;
  destinationDeadheadMiles: number | null;
  tripMiles: number | null;
  totalPracticalMiles: number | null;
  estimatedDriveMinutes: number | null;
  provider: string | null;
}

export interface MatchCandidateSummary {
  companyId: string;
  publisherId?: string;
  lane: {
    origin: string;
    destination: string;
  };
  equipment: string[];
  weight: number | null;
  rate: number | null;
  publishedAt: Date | null;
  reference: string;
}

export interface MatchCandidate {
  matchPostId: string;
  matchPostType: MatchSourcePostType;
  score: number;
  tier: MatchOpportunityTier;
  hazmatCompatible: boolean;
  equipmentCompatibility: EquipmentCompatibility;
  permissionStatus: PermissionStatus;
  permissionQuestion: string;
  reasonCodes: string[];
  scoreBreakdown: MatchScoreBreakdown;
  summary: MatchCandidateSummary;
  routeMetrics: MatchRouteMetrics;
}

export interface MatchSourceSummary {
  companyId: string;
  publisherId?: string;
  lane: {
    origin: string;
    destination: string;
  };
  equipment: string[];
  weight: number | null;
  rate: number | null;
  publishedAt: Date | null;
  availabilityStart: Date | null;
  availabilityEnd: Date | null;
  dhoRadius: number | null;
  dhdRadius: number | null;
  reference: string;
}

export interface MatchSnapshot extends Document {
  companyId: string;
  sourcePostId: string;
  sourcePostType: MatchSourcePostType;
  generatedByUserId: string;
  provider: string;
  status: "ready";
  candidateCount: number;
  sourceSummary: MatchSourceSummary;
  candidates: MatchCandidate[];
  createdAt?: Date;
  updatedAt?: Date;
}
