import * as mongoose from "mongoose";

import {notesBroker } from "../interface/notes.interface";

export const notesBrokerSchema = new mongoose.Schema<notesBroker>(
  {
    
    companyId: String,
    userId: String,
    postId: String,
    notes: Array,

  },
  {
    
    timestamps: true,
    collection: 'brokernotes'
  }
);
