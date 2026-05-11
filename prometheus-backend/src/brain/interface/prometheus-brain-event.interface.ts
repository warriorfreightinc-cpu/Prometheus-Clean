export type PrometheusBrainEventType =
  | "promptReceived"
  | "intentClassified"
  | "toolExecuted"
  | "suggestionShown"
  | "approvalRequested"
  | "approvalAccepted"
  | "approvalRejected"
  | "actionExecuted"
  | "memoryRequested"
  | "memorySaved"
  | "memoryDeleted"
  | "error";

export type PrometheusBrainSource =
  | "matching"
  | "booking"
  | "direct"
  | "company"
  | "loads"
  | "admin";

export interface PrometheusBrainEvent {
  companyId: string;
  userId: string;
  role: string;
  source: PrometheusBrainSource;
  type: PrometheusBrainEventType;
  prompt?: string;
  message?: string;
  intent?: string;
  tool?: string;
  related?: Record<string, string>;
  payload?: Record<string, unknown>;
}
