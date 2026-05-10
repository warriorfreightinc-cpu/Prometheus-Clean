import { Document } from "mongoose";

export interface PostCarrier extends Document {
  postId: string;
  publisherId:string;
  companyId:string;
  length:number;
  capacity: string;
  capacitySearch: String;
  weight: number;
  equipment: Array<String>;
  company:string;
  comment:string;
  refNum:string;
  startDate:Date;
  endDate:Date;
  nonTanker:Boolean;
  // date:Date,
  dhoRadius:Number;
  dhdRadius:Number;
  contact:string;
  origin:{};
  publishedAt:Date;
  distance: Number;
  team:Boolean;
  destination:{};
}
