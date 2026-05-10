import { Document } from "mongoose";

export interface History extends Document {
  companyId: string,
  history: Array<Object>
}
