import * as mongoose from "mongoose";
import { MatchingAssistantEvent } from "../interface/matching-assistant-event.interface";

const MatchingAssistantCommandSchema = new mongoose.Schema(
  {
    command: String,
    label: String,
    opportunityId: String,
  },
  { _id: false }
);

export const MatchingAssistantEventSchema = new mongoose.Schema<MatchingAssistantEvent>(
  {
    companyId: { type: String, index: true },
    userId: { type: String, index: true },
    targetRole: { type: String, index: true },
    dedupeKey: String,
    role: { type: String, enum: ["assistant", "user", "system"], index: true },
    message: String,
    relatedOpportunityId: { type: String, index: true },
    sourcePostId: { type: String, index: true },
    availableCommands: [MatchingAssistantCommandSchema],
  },
  {
    timestamps: true,
    collection: "matchingassistantevents",
  }
);

MatchingAssistantEventSchema.index({ companyId: 1, createdAt: -1 });
MatchingAssistantEventSchema.index({ userId: 1, createdAt: -1 });
MatchingAssistantEventSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
