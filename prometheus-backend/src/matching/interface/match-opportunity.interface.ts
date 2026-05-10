import { Document } from "mongoose";
import {
  EquipmentCompatibility,
  MatchOpportunityTier,
  PermissionStatus,
} from "../hazmat-match-classifier";
import { MatchSourcePostType } from "./match-snapshot.interface";

export type MatchOpportunityStatus =
  | "suggested"
  | "skipped"
  | "negotiating"
  | "approvedForBooking"
  | "booked"
  | "rejected"
  | "expired";

export interface MatchOpportunity extends Document {
  companyId: string;
  sourceCompanyId: string;
  sourcePostType: MatchSourcePostType;
  sourcePostId: string;
  candidateCompanyId: string;
  candidatePostType: MatchSourcePostType;
  candidatePostId: string;
  sourcePublisherId?: string;
  candidatePublisherId?: string;
  tier: MatchOpportunityTier;
  tierRank: number;
  score: number;
  hazmatCompatible: boolean;
  equipmentCompatibility: EquipmentCompatibility;
  permissionQuestion: string;
  permissionStatus: PermissionStatus;
  status: MatchOpportunityStatus;
  reasonCodes: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
