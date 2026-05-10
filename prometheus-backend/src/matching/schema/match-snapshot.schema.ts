import * as mongoose from "mongoose";
import { MatchSnapshot } from "../interface/match-snapshot.interface";

const MatchScoreBreakdownSchema = new mongoose.Schema(
  {
    laneFit: Number,
    equipmentFit: Number,
    weightFit: Number,
    freshnessFit: Number,
    rateFit: Number,
  },
  { _id: false }
);

const MatchRouteMetricsSchema = new mongoose.Schema(
  {
    originDeadheadMiles: Number,
    destinationDeadheadMiles: Number,
    tripMiles: Number,
    totalPracticalMiles: Number,
    estimatedDriveMinutes: Number,
    provider: String,
  },
  { _id: false }
);

const MatchCandidateSummarySchema = new mongoose.Schema(
  {
    companyId: String,
    publisherId: String,
    lane: {
      origin: String,
      destination: String,
    },
    equipment: [String],
    weight: Number,
    rate: Number,
    publishedAt: Date,
    reference: String,
  },
  { _id: false }
);

const MatchCandidateSchema = new mongoose.Schema(
  {
    matchPostId: String,
    matchPostType: {
      type: String,
      enum: ["carrierPost", "brokerPost"],
    },
    score: Number,
    tier: {
      type: String,
      enum: ["strictHazmat", "hazmatNearMatch", "hazmatPermission", "hazmatMarketAlternative", "nonHazmatFallback"],
    },
    hazmatCompatible: Boolean,
    equipmentCompatibility: {
      type: String,
      enum: ["exact", "compatible", "requiresPermission", "incompatible"],
    },
    permissionStatus: {
      type: String,
      enum: ["notNeeded", "notAsked", "asked", "accepted", "rejected", "expired"],
    },
    permissionQuestion: String,
    reasonCodes: [String],
    scoreBreakdown: MatchScoreBreakdownSchema,
    summary: MatchCandidateSummarySchema,
    routeMetrics: MatchRouteMetricsSchema,
  },
  { _id: false }
);

const MatchSourceSummarySchema = new mongoose.Schema(
  {
    companyId: String,
    publisherId: String,
    lane: {
      origin: String,
      destination: String,
    },
    equipment: [String],
    weight: Number,
    rate: Number,
    publishedAt: Date,
    availabilityStart: Date,
    availabilityEnd: Date,
    dhoRadius: Number,
    dhdRadius: Number,
    reference: String,
  },
  { _id: false }
);

export const MatchSnapshotSchema = new mongoose.Schema<MatchSnapshot>(
  {
    companyId: { type: String, index: true },
    sourcePostId: { type: String, index: true },
    sourcePostType: {
      type: String,
      enum: ["carrierPost", "brokerPost"],
      index: true,
    },
    generatedByUserId: { type: String, index: true },
    provider: String,
    status: { type: String, enum: ["ready"], default: "ready" },
    candidateCount: Number,
    sourceSummary: MatchSourceSummarySchema,
    candidates: [MatchCandidateSchema],
  },
  {
    timestamps: true,
    collection: "matchsnapshots",
  }
);

MatchSnapshotSchema.index({ sourcePostType: 1, sourcePostId: 1, createdAt: -1 });
MatchSnapshotSchema.index({ companyId: 1, createdAt: -1 });
