import * as mongoose from "mongoose";

export const ChatbbThreadSchema = new mongoose.Schema(
  {
    ownerUserId: String,
    ownerRole: String,
    ownerCompanyId: String,
    carrierPostId: String,
    brokerPostId: String,
    status: {
      type: String,
      default: "active"
    },
    messages: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    lastContext: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true,
    collection: "chatbbthreads"
  }
);

ChatbbThreadSchema.index(
  {
    ownerUserId: 1,
    ownerRole: 1,
    carrierPostId: 1,
    brokerPostId: 1
  },
  { unique: true }
);
