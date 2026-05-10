import { Document } from "mongoose";

export interface watchlistBroker extends Document {
  companyId: string,
  userId: string,
  postId: string,
  comments: Array<Object>,
}
