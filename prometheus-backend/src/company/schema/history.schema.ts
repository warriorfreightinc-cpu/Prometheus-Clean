import * as mongoose from "mongoose";

import {History } from "../interface/history.interface";

export const HistorySchema = new mongoose.Schema<History>(
  {
    
    companyId: String,
    history: Array<Object>()

  },
  {
    
    timestamps: true,
    collection: 'history'
  }
);
