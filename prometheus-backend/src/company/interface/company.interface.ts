import { Document } from "mongoose";
import { CompanyIntegrationCategory, CompanyIntegrationStatus } from "../integrations/dto/company-integration.dto";


export interface Address{
  counry:string;
  city:string;
  state?:string;
  street:string;
  zip:string;
}

export interface ContactPerson{
  firstName:string;
  lastName:string;
  email:string;
  phone:string;
  verificationPhone?: string;
  role:string;
}

export interface CarrierInfo{
  equipmentTypes:[string]
  numTrucks:number
}

export interface OnboardingProviderReference {
  provider: string;
  externalId?: string;
  rawStatus?: string;
  lastSyncedAt?: Date;
}

export interface OnboardingDocumentVerification {
  fileType: "mc" | "insurance" | "hazmat";
  displayName: string;
  fileName?: string;
  ext?: string;
  source: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
  status: "missing" | "pending" | "verified" | "rejected" | "expired";
  expirationDate?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  notes?: string;
  providerReference?: OnboardingProviderReference;
}

export interface OnboardingState {
  status?: string;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  correctionRequestedAt?: Date;
  correctionRequestedBy?: string;
  setupEmailSentAt?: Date;
  requestedSeats?: number;
  previousStatus?: string;
  blockedAt?: Date;
  blockedReasons?: string[];
  blockedSource?: string;
  unblockedAt?: Date;
  unblockedBy?: string;
  verificationOverride?: boolean;
  verificationSummary?: {
    source: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
    status: "pending" | "verified" | "rejected" | "expired";
    checkedAt?: Date;
    checkedBy?: string;
  };
  documents?: {
    mc?: OnboardingDocumentVerification;
    insurance?: OnboardingDocumentVerification;
    hazmat?: OnboardingDocumentVerification;
  };
}

export interface CompanyIntegration {
  _id?: any;
  companyId?: string;
  category: CompanyIntegrationCategory;
  provider: string;
  label: string;
  status: CompanyIntegrationStatus;
  enabled: boolean;
  setupUrl?: string;
  credentialRef?: string;
  notes?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Company extends Document {
  
  adminId?: any;
  name:string
  dba?: string;
  email: string;
  phone:string;
  dot:string;
  mc:string;
  address:Address;
  type:string;
  filesNames:Object;
  filesUploaded:boolean
  clientId:String;
  status:string;
  statusDate:Date;
  statusReason:string;
  deactivationReason:string;
  contactPerson:ContactPerson,
  isWaiting:boolean,
  subscription:any
  integrations?: CompanyIntegration[];
  onboarding?: OnboardingState;
  deletedAt?: Date;
  deletedBy?: string;
  notes:[];
  createdAt: Date;
  updatedAt: Date;
}
