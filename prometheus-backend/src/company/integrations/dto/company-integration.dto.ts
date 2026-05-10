export type CompanyIntegrationCategory = "setup" | "tracking" | "eld";
export type CompanyIntegrationStatus = "not_connected" | "connected" | "needs_attention" | "disabled";
export type RoomIntegrationChoiceCategory = CompanyIntegrationCategory | "manual";
export type RoomIntegrationChoiceSource = "broker" | "carrier" | "manual";
export type RoomIntegrationExecutionStatus = "staged" | "unavailable";
export type RoomIntegrationExecutionMode = "configured" | "placeholder" | "manual";

export class UpsertCompanyIntegrationDTO {
  readonly category: CompanyIntegrationCategory;
  readonly provider: string;
  readonly label: string;
  readonly enabled?: boolean;
  readonly status?: CompanyIntegrationStatus;
  readonly setupUrl?: string;
  readonly credentialRef?: string;
  readonly notes?: string;
  readonly credentialValue?: string;
}

export class UpdateCompanyIntegrationDTO {
  readonly category?: CompanyIntegrationCategory;
  readonly provider?: string;
  readonly label?: string;
  readonly enabled?: boolean;
  readonly status?: CompanyIntegrationStatus;
  readonly setupUrl?: string;
  readonly credentialRef?: string;
  readonly notes?: string;
  readonly credentialValue?: string;
}

export class RoomIntegrationChoicesQueryDTO {
  readonly brokerPostId: string;
  readonly carrierPostId: string;
}

export class ExecuteRoomIntegrationDTO {
  readonly brokerPostId: string;
  readonly carrierPostId: string;
  readonly category: RoomIntegrationChoiceCategory;
  readonly provider: string;
  readonly label?: string;
  readonly source?: RoomIntegrationChoiceSource;
}

export interface CompanyIntegrationResponseDTO {
  id: string;
  companyId?: string;
  category: CompanyIntegrationCategory;
  provider: string;
  label: string;
  status: CompanyIntegrationStatus;
  enabled: boolean;
  setupUrl?: string;
  notes?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RoomIntegrationChoiceDTO {
  id?: string;
  companyId?: string;
  source: RoomIntegrationChoiceSource;
  category: RoomIntegrationChoiceCategory;
  provider: string;
  label: string;
  setupUrl?: string;
}

export interface RoomIntegrationChoicesDTO {
  setupChoices: RoomIntegrationChoiceDTO[];
  trackingChoices: RoomIntegrationChoiceDTO[];
}

export interface RoomIntegrationExecutionDTO {
  status: RoomIntegrationExecutionStatus;
  mode: RoomIntegrationExecutionMode;
  provider: string;
  label: string;
  category: RoomIntegrationChoiceCategory;
  source: RoomIntegrationChoiceSource;
  message: string;
  setupUrl?: string;
}
