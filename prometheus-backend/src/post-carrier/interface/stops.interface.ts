import { Document } from "mongoose";

export interface StopsCarrier extends Document {
  type: string;
  place:Object;
  startDate: Date;
  endDate: Date;
  driverWork: boolean;
  comment:string;
}
