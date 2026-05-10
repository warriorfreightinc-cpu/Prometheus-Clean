import { Document } from "mongoose";

export interface ChatbbThreadMessage {
  sender: "system" | "user" | "assistant";
  text: string;
  createdAt: Date;
  plan?: Record<string, any>;
}

export interface ChatbbThread extends Document {
  ownerUserId: string;
  ownerRole: string;
  ownerCompanyId?: string;
  carrierPostId: string;
  brokerPostId: string;
  status: string;
  messages: ChatbbThreadMessage[];
  lastContext?: Record<string, any>;
}
