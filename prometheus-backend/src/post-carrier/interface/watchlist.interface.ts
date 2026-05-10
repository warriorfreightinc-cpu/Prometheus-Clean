import { Document } from "mongoose";

export interface watchlistCarrier extends Document {
  companyId: string,
  userId: string,
  postId: string,
  comments: Array<Object>,
}
