export class ResponseLoadDTO {
  readonly _id: string;
  readonly companyId: string;
  readonly createdBy: string;
  readonly creatorRole: string;
  readonly loadNumber: string;
  readonly reference: string;
  readonly status: "active" | "library" | "readyToBill" | "archived";
  readonly statusNote?: string;
  readonly summary?: string;
  readonly lane: {
    origin: string;
    destination: string;
  };
  readonly source: {
    brokerPostId: string;
    carrierPostId: string;
  };
  readonly broker: {
    companyName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  readonly carrier: {
    companyName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  readonly driver: {
    name?: string;
    truckLabel?: string;
  };
  readonly dispatch: {
    assignedDispatcherId: string;
    assignedDispatcherName: string;
    assignedDispatcherEmail: string;
  };
  readonly accessRequests?: Array<{
    id: string;
    requestedById: string;
    requestedByName: string;
    requestedByEmail: string;
    requestedAt: Date;
    targetDispatcherId: string;
    targetDispatcherName: string;
    status: "pending" | "approved" | "rejected";
    note?: string;
    decidedById?: string;
    decidedByName?: string;
    decidedAt?: Date;
    decisionNote?: string;
  }>;
  readonly equipmentLabel?: string;
  readonly rate?: number | null;
  readonly weight?: number | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}
