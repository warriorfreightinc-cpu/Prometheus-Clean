import * as mongoose from "mongoose";
import { MatchOpportunity } from "../interface/match-opportunity.interface";

export const MatchOpportunitySchema = new mongoose.Schema<MatchOpportunity>(
  {
    companyId: { type: String, index: true },
    sourceCompanyId: { type: String, index: true },
    sourcePostType: { type: String, enum: ["carrierPost", "brokerPost"], index: true },
    sourcePostId: { type: String, index: true },
    candidateCompanyId: { type: String, index: true },
    candidatePostType: { type: String, enum: ["carrierPost", "brokerPost"], index: true },
    candidatePostId: { type: String, index: true },
    sourcePublisherId: String,
    candidatePublisherId: String,
    tier: {
      type: String,
      enum: ["strictHazmat", "hazmatNearMatch", "hazmatPermission", "hazmatMarketAlternative", "nonHazmatFallback"],
      index: true,
    },
    tierRank: { type: Number, index: true },
    score: Number,
    hazmatCompatible: Boolean,
    equipmentCompatibility: {
      type: String,
      enum: ["exact", "compatible", "requiresPermission", "incompatible"],
      index: true,
    },
    permissionQuestion: String,
    permissionStatus: {
      type: String,
      enum: ["notNeeded", "notAsked", "asked", "accepted", "rejected", "expired"],
      default: "notAsked",
      index: true,
    },
    status: {
      type: String,
      enum: ["suggested", "skipped", "negotiating", "approvedForBooking", "booked", "rejected", "expired"],
      default: "suggested",
      index: true,
    },
    reasonCodes: [String],
  },
  {
    timestamps: true,
    collection: "matchopportunities",
  }
);

MatchOpportunitySchema.index(
  { sourcePostType: 1, sourcePostId: 1, candidatePostType: 1, candidatePostId: 1 },
  { unique: true }
);
MatchOpportunitySchema.index({ companyId: 1, status: 1, tierRank: 1, score: -1, updatedAt: -1 });
