import { Document } from "mongoose";

export interface notesCarrier extends Document {
  companyId: string,
  userId: string,
  postId: string,
  notes: Array<Object>,
}
