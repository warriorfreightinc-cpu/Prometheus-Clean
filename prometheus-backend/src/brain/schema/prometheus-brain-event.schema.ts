import * as mongoose from "mongoose";

export const PrometheusBrainEventSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true },
    source: {
      type: String,
      enum: ["matching", "booking", "direct", "company", "loads", "admin"],
      required: true,
    },
    type: {
      type: String,
      enum: [
        "promptReceived",
        "intentClassified",
        "toolExecuted",
        "suggestionShown",
        "approvalRequested",
        "approvalAccepted",
        "approvalRejected",
        "actionExecuted",
        "memoryRequested",
        "memorySaved",
        "memoryDeleted",
        "error",
      ],
      required: true,
      index: true,
    },
    prompt: String,
    message: String,
    intent: String,
    tool: String,
    related: Object,
    payload: Object,
  },
  { timestamps: true }
);

PrometheusBrainEventSchema.index({ companyId: 1, createdAt: -1 });
