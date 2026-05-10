import * as mongoose from "mongoose";

import {notesCarrier } from "../interface/notes.interface";

export const notesCarrierSchema = new mongoose.Schema<notesCarrier>(
  {
    
    companyId: String,
    userId: String,
    postId: String,
    notes: Array,

  },
  {
    
    timestamps: true,
    collection: 'carriernotes'
  }
);
