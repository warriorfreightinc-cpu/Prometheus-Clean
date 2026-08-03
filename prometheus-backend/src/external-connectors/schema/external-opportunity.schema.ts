import * as mongoose from "mongoose";
import { ExternalOpportunity } from "../interface/external-opportunity.interface";

const LocationSchema = new mongoose.Schema(
  {
    type: { type: String, default: "place" },
    place: {
      city: String,
      state: String,
      zip: String,
      country: String,
    },
    location: {
      coordinates: {
        lat: Number,
        lng: Number,
      },
      geoLocation: {
        type: { type: String, default: "Point" },
        coordinates: [Number],
      },
    },
  },
  { _id: false }
);

export const ExternalOpportunitySchema = new mongoose.Schema<ExternalOpportunity>(
  {
    companyId: { type: String, required: true, index: true },
    integrationId: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    providerLabel: { type: String, required: true },
    externalId: { type: String, required: true },
    kind: { type: String, enum: ["load", "truck"], required: true, index: true },
    status: { type: String, enum: ["active", "removed"], default: "active", index: true },
    origin: { type: LocationSchema, required: true },
    destination: LocationSchema,
    pickup: Object,
    delivery: Object,
    equipment: [String],
    length: Number,
    weight: Number,
    commodity: String,
    hazmat: Boolean,
    nonHazmat: Boolean,
    hazmatClass: String,
    unNumbers: [String],
    capacity: String,
    rate: Number,
    currency: String,
    specialNotes: String,
    contact: Object,
    booking: Object,
    sourceRequestId: String,
    sourceUpdatedAt: Date,
    publishedAt: Date,
    lastSeenAt: { type: Date, required: true },
    expiresAt: Date,
  },
  {
    timestamps: true,
    collection: "externalopportunities",
  }
);

ExternalOpportunitySchema.index(
  { companyId: 1, integrationId: 1, kind: 1, externalId: 1 },
  { unique: true }
);
ExternalOpportunitySchema.index({ companyId: 1, kind: 1, status: 1, sourceUpdatedAt: -1 });
ExternalOpportunitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
