import * as mongoose from "mongoose";
import { PrometheusLoad } from "../interface/load.interface";

export const PrometheusLoadSchema = new mongoose.Schema<PrometheusLoad>(
  {
    companyId: { type: String, index: true },
    createdBy: String,
    creatorRole: String,
    loadNumber: String,
    reference: String,
    status: { type: String, enum: ["active", "library", "readyToBill", "archived"], default: "active", index: true },
    statusNote: String,
    summary: String,
    lane: {
      origin: String,
      destination: String,
    },
    source: {
      brokerPostId: { type: String, index: true },
      carrierPostId: { type: String, index: true },
    },
    broker: {
      companyName: String,
      contactName: String,
      contactEmail: String,
      contactPhone: String,
    },
    carrier: {
      companyName: String,
      contactName: String,
      contactEmail: String,
      contactPhone: String,
    },
    driver: {
      name: String,
      truckLabel: String,
    },
    dispatch: {
      assignedDispatcherId: { type: String, index: true },
      assignedDispatcherName: String,
      assignedDispatcherEmail: String,
    },
    equipmentLabel: String,
    rate: Number,
    weight: Number,
  },
  {
    timestamps: true,
    collection: "prometheusloads",
  }
);

PrometheusLoadSchema.index({ companyId: 1, "source.brokerPostId": 1, "source.carrierPostId": 1 }, { unique: true });
