import * as mongoose from "mongoose";

export const PrometheusBrainMemorySchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    approvedBy: { type: String, required: true },
    scope: {
      type: String,
      enum: ["company", "driver", "broker", "lane", "customer", "user"],
      required: true,
      index: true,
    },
    subjectKey: { type: String, required: true, index: true },
    subjectLabel: { type: String, required: true },
    content: { type: String, required: true },
    tags: [String],
    sourceApprovalId: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

PrometheusBrainMemorySchema.index({
  companyId: 1,
  scope: 1,
  subjectKey: 1,
  active: 1,
});
