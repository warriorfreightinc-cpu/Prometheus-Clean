import * as mongoose from "mongoose";

import {watchlistCarrier } from "../interface/watchlist.interface";

export const watchlistCarrierSchema = new mongoose.Schema<watchlistCarrier>(
  {
    
    companyId: String,
    userId: String,
    postId: String,
    comments: Array,

  },
  {
    
    timestamps: true,
    collection: 'carrierwatchlist'
  }
);
