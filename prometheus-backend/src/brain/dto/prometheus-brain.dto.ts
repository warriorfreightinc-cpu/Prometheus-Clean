import { PrometheusBrainSource } from "../interface/prometheus-brain-event.interface";

export class PrometheusBrainPromptDTO {
  prompt: string;
  source: PrometheusBrainSource;
  related?: {
    sourcePostId?: string;
    sourcePostType?: "brokerPost" | "carrierPost";
    roomId?: string;
    loadId?: string;
    companyId?: string;
  };
}

export class UpdateBrainSettingsDTO {
  memoryMode?: "off" | "companyManaged" | "prometheusManaged";
  auditRetentionDays?: number;
  allowProviderTools?: boolean;
}
