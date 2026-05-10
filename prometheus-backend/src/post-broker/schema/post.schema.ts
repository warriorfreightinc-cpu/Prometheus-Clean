import * as mongoose from "mongoose";

import {PostBroker } from "../interface/post.interface";
import { StopsBrokerSchema } from "./stops.schema";

export const PostBrokerSchema = new mongoose.Schema<PostBroker>(
  {
    
    postId:mongoose.Schema.Types.ObjectId,
    publisherId:String,
    companyId:String,
    length: Number,
    weight: Number,
    equipment: Array,
    capacity: String,
    capacitySearch: String,
    contact: String,
    company: String,
    origin: Object,
    destination: Object,
    distance:Number,
    publishedAt:Date,
    comment:String,
    bookUrl:String,
    refNum:String,
    tankerEndorsement:Boolean,
    nonHazmat:Boolean,
    team:Boolean,
    rate:Number,
    stopsDistances:[Number],
    dhoRadius:Number,
    dhdRadius:Number,
    companyDot:String,
    companyMc:String,
    companyName:String,
    companyFirstName:String,
    companyLastName:String,
    companyEmail:String,
    companyPhone:String,
    stops: [StopsBrokerSchema]
  },
  {
    
    timestamps: true,
    collection: 'brokerposts'
  }
);
PostBrokerSchema.index({'origin.geoLocation':'2dsphere'});
PostBrokerSchema.index({'destination.geoLocation':'2dsphere'});
PostBrokerSchema.index({weight:1,length:1,origin:1,destination:1,capacitySearch:1,refNum:1})
