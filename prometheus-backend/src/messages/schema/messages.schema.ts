import * as mongoose from "mongoose";

import {Messages} from "../interface/messages.interface";

export const MessagesSchema = new mongoose.Schema<Messages>(
  {
    
    carrierPostId: { type: String, index: true },
    brokerPostId: { type: String, index: true },
    brokerId: String,
    carrierId: String,
    hiddenForBroker:Boolean,
    hiddenForCarrier:Boolean,
    messages: Array,
    createdBy:String,
    seen: {brokerCount:Number,carrierCount:Number},
    bookingStatus: {
      type: String,
      enum: ["negotiating", "booked", "cancelled", "delivered"],
      default: "negotiating",
      index: true,
    },
    brokerApprovedBooking: { type: Boolean, default: false },
    carrierApprovedBooking: { type: Boolean, default: false },
    bookingConfirmedAt: Date,
    bookingConfirmedBy: String,
    bookingRate: Number,
    bookingNotes: String,
    loadId: String,
    bookingCancelledAt: Date,
    bookingStatusUpdatedAt: Date,
    bookingStatusUpdatedBy: String,
    bookingWorkflow: {
      setupProvider: String,
      setupLabel: String,
      setupSource: String,
      setupUpdatedAt: Date,
      driverId: String,
      driverName: String,
      truckLabel: String,
      driverUpdatedAt: Date,
      contactSaved: { type: Boolean, default: false },
      contactName: String,
      contactEmail: String,
      contactUpdatedAt: Date,
      trackingProvider: String,
      trackingSource: String,
      trackingShared: { type: Boolean, default: false },
      trackingUpdatedAt: Date,
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      cancelled: { type: Boolean, default: false },
      cancellationMode: String,
      cancellationNote: String,
      cancellationAt: Date,
      readyToBill: { type: Boolean, default: false },
      readyToBillAt: Date,
      updatedAt: Date,
      updatedBy: String,
    },

  },
  {
    
    timestamps: true,
    collection: 'messages'
  }
);

MessagesSchema.index({ brokerPostId: 1, carrierPostId: 1 }, { unique: true });
