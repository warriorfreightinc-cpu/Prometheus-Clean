import * as mongoose from "mongoose";
import { Company } from "../interface/company.interface";

const CompanyIntegrationSchema = new mongoose.Schema(
  {
    companyId: String,
    category: {
      type: String,
      enum: ["setup", "tracking", "eld", "loadboard", "tms", "mailbox"],
      required: true
    },
    provider: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["not_connected", "connected", "needs_attention", "disabled"],
      default: "not_connected"
    },
    enabled: {
      type: Boolean,
      default: true
    },
    setupUrl: String,
    credentialRef: String,
    notes: String,
    createdBy: String,
    updatedBy: String
  },
  {
    timestamps: true
  }
);


export const CompanySchema = new mongoose.Schema<Company>(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String,
    dba: String,
    email: {type:String,unique:true},
    phone: String,
    dot: String,
    mc: String,
    clientId:String,
    address: {
      country: String,
      city: String,
      street: String,
      state:String,
      zip:String
    },
    type: String,
   isWaiting:Boolean,
    filesUploaded:Boolean,
    filesNames:Object,
    status: String,
    statusDate: Date,
    deactivationReason:String,
    statusReason: String,
    notes:[],
    contactPerson:{
      firstName:String,
      lastName:String,
      email:String,
      phone:String,
      verificationPhone:String,
      role:String
    },
    subscription:Object,
    integrations: [CompanyIntegrationSchema],
    onboarding: {
      status: String,
      submittedAt: Date,
      approvedAt: Date,
      approvedBy: String,
      correctionRequestedAt: Date,
      correctionRequestedBy: String,
      setupEmailSentAt: Date,
      requestedSeats: Number,
      previousStatus: String,
      blockedAt: Date,
      blockedReasons: [String],
      blockedSource: String,
      unblockedAt: Date,
      unblockedBy: String,
      verificationOverride: Boolean,
      verificationSummary: {
        source: String,
        status: String,
        checkedAt: Date,
        checkedBy: String
      },
      documents: {
        mc: Object,
        insurance: Object,
        hazmat: Object
      }
    },
    brainSettings: {
      memoryMode: {
        type: String,
        enum: ["off", "companyManaged", "prometheusManaged"],
        default: "off"
      },
      auditRetentionDays: {
        type: Number,
        default: 365
      },
      allowProviderTools: {
        type: Boolean,
        default: false
      },
      ai: {
        providerMode: {
          type: String,
          enum: ["prometheusManaged", "companyOpenAi", "local", "disabled"],
          default: "local"
        },
        reasoningModel: {
          type: String,
          default: "gpt-5.5"
        },
        economyModel: {
          type: String,
          default: "gpt-5.4-mini"
        },
        monthlyBudgetUsd: {
          type: Number,
          default: 50
        },
        dailyRequestLimit: {
          type: Number,
          default: 500
        },
        providerKeyStatus: {
          type: String,
          enum: ["missing", "connected", "failed", "rotating"],
          default: "missing"
        },
        providerKeyFingerprint: String,
        providerLastTestedAt: Date,
        providerLastError: String,
        encryptedOpenAiApiKey: String
      },
      updatedBy: String,
      updatedAt: Date
    },
    deletedAt: Date,
    deletedBy: String
  },
  {
    timestamps: true
  }
);

CompanySchema.index({ status: 1, createdAt: -1 });
CompanySchema.index({ "onboarding.status": 1, createdAt: -1 });
CompanySchema.index({ deletedAt: 1 });
