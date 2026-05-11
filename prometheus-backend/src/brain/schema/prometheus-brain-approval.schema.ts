import * as mongoose from "mongoose";

export const PrometheusBrainApprovalSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    requestedBy: { type: String, required: true },
    decidedBy: String,
    role: { type: String, required: true },
    actionType: {
      type: String,
      enum: [
        "sendEmail",
        "sendChat",
        "placeBid",
        "sendCounter",
        "startBookingApproval",
        "confirmBooking",
        "cancelLoad",
        "requestTracking",
        "assignDriver",
        "markDelivered",
        "moveLoadState",
        "saveMemory",
        "changeCompanyAccess",
        "providerPending",
      ],
      required: true,
    },
    label: { type: String, required: true },
    summary: { type: String, required: true },
    riskNote: { type: String, required: true },
    payload: { type: Object, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired", "executed", "failed"],
      default: "pending",
      index: true,
    },
    expiresAt: Date,
    decisionAt: Date,
    result: Object,
  },
  { timestamps: true }
);

PrometheusBrainApprovalSchema.index({ companyId: 1, status: 1, createdAt: -1 });
