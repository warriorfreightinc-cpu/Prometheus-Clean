import { Document } from "mongoose";

export type PrometheusLoadStatus = "active" | "library" | "readyToBill" | "archived";

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
  equipmentLabel?: string;
  rate?: number | null;
  weight?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}
