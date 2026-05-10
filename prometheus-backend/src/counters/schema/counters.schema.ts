import * as mongoose from "mongoose";

import { CountersInterface } from "../interface/counters.interface";


export const CountersSchema = new mongoose.Schema<CountersInterface>(
  {
    companyCounter: Number
  },
  {
    timestamps: true
  }
);
