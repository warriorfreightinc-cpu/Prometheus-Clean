import { PrometheusBrainSource } from "../interface/prometheus-brain-event.interface";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";

export class PrometheusBrainPromptDTO {
  @IsString()
  prompt: string;

  @IsIn(["matching", "booking", "direct", "company", "loads", "admin"])
  source: PrometheusBrainSource;

  @IsOptional()
  @IsObject()
  related?: {
    sourcePostId?: string;
    sourcePostType?: "brokerPost" | "carrierPost";
    roomId?: string;
    loadId?: string;
    companyId?: string;
  };
}

export class UpdateBrainSettingsDTO {
  @IsOptional()
  @IsIn(["off", "companyManaged", "prometheusManaged"])
  memoryMode?: "off" | "companyManaged" | "prometheusManaged";

  @IsOptional()
  @IsInt()
  @Min(1)
  auditRetentionDays?: number;

  @IsOptional()
  @IsBoolean()
  allowProviderTools?: boolean;
}
