import { ExternalFreightBatchDTO } from "./dto/external-connector.dto";

export interface ExternalConnectorAdapterContext {
  companyId: string;
  integrationId: string;
  provider: string;
  endpoint?: string;
  credentialRef?: string;
}

export interface ExternalConnectorAdapter {
  readonly provider: string;
  pull(context: ExternalConnectorAdapterContext): Promise<ExternalFreightBatchDTO>;
}
