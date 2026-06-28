import { PrometheusBrainSource } from "../interface/prometheus-brain-event.interface";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

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

export class BrainAiSettingsDTO {
  @IsOptional()
  @IsIn(["prometheusManaged", "companyOpenAi", "local", "disabled"])
  providerMode?: "prometheusManaged" | "companyOpenAi" | "local" | "disabled";

  @IsOptional()
  @IsString()
  reasoningModel?: string;

  @IsOptional()
  @IsString()
  economyModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  monthlyBudgetUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyRequestLimit?: number;

  @IsOptional()
  @IsString()
  openAiApiKey?: string;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => BrainAiSettingsDTO)
  ai?: BrainAiSettingsDTO;
}
