import * as mongoose from "mongoose";

import { StopsBroker } from "../interface/stops.interface";

export const StopsBrokerSchema = new mongoose.Schema<StopsBroker>(
  {
    
    type: String,
    place: Object,
    startDate: Date,
    endDate: Date,
    comment: String,
  },
  {
    timestamps: true
  }
);
