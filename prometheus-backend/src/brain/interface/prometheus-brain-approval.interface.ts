export type PrometheusBrainApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "failed";

export type PrometheusBrainActionType =
  | "sendEmail"
  | "sendChat"
  | "placeBid"
  | "sendCounter"
  | "startBookingApproval"
  | "confirmBooking"
  | "cancelLoad"
  | "requestTracking"
  | "assignDriver"
  | "markDelivered"
  | "moveLoadState"
  | "saveMemory"
  | "changeCompanyAccess"
  | "providerPending";

export interface PrometheusBrainApproval {
  _id?: string;
  companyId: string;
  requestedBy: string;
  decidedBy?: string;
  role: string;
  actionType: PrometheusBrainActionType;
  label: string;
  summary: string;
  riskNote: string;
  payload: Record<string, unknown>;
  status: PrometheusBrainApprovalStatus;
  expiresAt?: Date;
  decisionAt?: Date;
  result?: Record<string, unknown>;
}

export type CreatePrometheusBrainApproval = Omit<
  PrometheusBrainApproval,
  "_id" | "status" | "decidedBy" | "decisionAt" | "result"
>;
