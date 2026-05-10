import { Document } from "mongoose";

export interface UserLanguage extends Document {
  from: string;
  to: string;
}
