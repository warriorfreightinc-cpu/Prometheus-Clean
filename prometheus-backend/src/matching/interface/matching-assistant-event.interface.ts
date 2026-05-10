import { Document } from "mongoose";

export type MatchingAssistantEventRole = "assistant" | "user" | "system";

export interface MatchingAssistantCommand {
  command: string;
  label: string;
  opportunityId?: string;
}

export interface MatchingAssistantEvent extends Document {
  companyId: string;
  userId?: string;
  targetRole?: string;
  dedupeKey?: string;
  role: MatchingAssistantEventRole;
  message: string;
  relatedOpportunityId?: string;
  sourcePostId?: string;
  availableCommands: MatchingAssistantCommand[];
  createdAt?: Date;
  updatedAt?: Date;
}
