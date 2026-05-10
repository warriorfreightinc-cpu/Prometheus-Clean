import { Document } from "mongoose";

export interface notesBroker extends Document {
  companyId: string,
  userId: string,
  postId: string,
  notes: Array<Object>,
}
