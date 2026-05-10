import { Document } from "mongoose";

export interface StopsBroker extends Document {
  type: string;
  place:Object;
  startDate: Date;
  endDate:Date;
  comment:string;
}
