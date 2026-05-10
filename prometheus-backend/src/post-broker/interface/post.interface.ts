import { Document } from "mongoose";

export interface PostBroker extends Document {
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
  bookUrl:string;
  refNum:string;
  contact:string;
  origin:Object;
  destination:Object;
  distance:Number;
  publishedAt:Date;
  rate:Number;
  dhoRadius:Number;
  dhdRadius:Number;
  tankerEndorsement:Boolean;
  nonHazmat:Boolean;
  team:Boolean;
  stopsDistances:Array<Number>;
  companyName?: string;
  companyDot?: string;
  companyMc?: string;
  companyFirstName?:string;
  companyLastName?:String;
  companyEmail?:String;
  companyPhone?:String;
  stops: [{}];
}
