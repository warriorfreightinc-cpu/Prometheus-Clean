import * as mongoose from "mongoose";

import { StopsCarrier } from "../interface/stops.interface";

export const StopsCarrierSchema = new mongoose.Schema<StopsCarrier>(
  {
    place: Object,
  },
  {
    timestamps: true
  }
);
