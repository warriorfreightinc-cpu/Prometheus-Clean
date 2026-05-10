import * as mongoose from "mongoose";

import {watchlistBroker } from "../interface/watchlist.interface";

export const watchlistBrokerSchema = new mongoose.Schema<watchlistBroker>(
  {
    
    companyId: String,
    userId: String,
    postId: String,
    comments: Array,

  },
  {
    
    timestamps: true,
    collection: 'brokerwatchlist'
  }
);
