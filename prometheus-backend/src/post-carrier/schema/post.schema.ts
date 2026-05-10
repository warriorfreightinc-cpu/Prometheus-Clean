import * as mongoose from "mongoose";

import {PostCarrier } from "../interface/post.interface";
import { StopsCarrierSchema } from "./stops.schema";

export const PostCarrierSchema = new mongoose.Schema<PostCarrier>(
  {
    
    postId:mongoose.Schema.Types.ObjectId,
    publisherId:String,
    companyId:String,
    contact:String,
    length: Number,
    weight: Number,
    equipment: Array,
    capacity: String,
    capacitySearch: String,
    startDate:Date,
    endDate:Date,
    // date:Date,
    dhoRadius:Number,
    dhdRadius:Number,
    company:String,
    comment:String,
    refNum:String,
    origin:Object,
    team:Boolean,
    nonTanker:Boolean,
    distance:Number,
    publishedAt: Date,
    destination:Object,
  },
  {
    
    timestamps: true,
    collection: 'carrierposts'
  },
  
);

PostCarrierSchema.index({'origin.geoLocation':'2dsphere'});
PostCarrierSchema.index({'destination.geoLocation':'2dsphere'});
PostCarrierSchema.index({weight:1,length:1,origin:1,destination:1,capacitySearch:1,refNum:1})
