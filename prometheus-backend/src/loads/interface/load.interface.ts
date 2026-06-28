import { Document } from "mongoose";

export type PrometheusLoadStatus = "active" | "library" | "readyToBill" | "archived";
export type LoadAccessRequestStatus = "pending" | "approved" | "rejected";

export interface LoadAccessRequest {
  id: string;
  requestedById: string;
  requestedByName: string;
  requestedByEmail: string;
  requestedAt: Date;
  targetDispatcherId: string;
  targetDispatcherName: string;
  status: LoadAccessRequestStatus;
  note?: string;
  decidedById?: string;
  decidedByName?: string;
  decidedAt?: Date;
  decisionNote?: string;
}

export interface PrometheusLoad extends Document {
  companyId: string;
  createdBy: string;
  creatorRole: string;
  loadNumber: string;
  reference: string;
  status: PrometheusLoadStatus;
  statusNote?: string;
  summary?: string;
  lane: {
    origin: string;
    destination: string;
  };
  source: {
    brokerPostId: string;
    carrierPostId: string;
  };
  broker: {
    companyName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  carrier: {
    companyName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  driver: {
    name?: string;
    truckLabel?: string;
  };
  dispatch: {
    assignedDispatcherId: string;
    assignedDispatcherName: string;
    assignedDispatcherEmail: string;
  };
  accessRequests?: LoadAccessRequest[];
  equipmentLabel?: string;
  rate?: number | null;
  weight?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}
