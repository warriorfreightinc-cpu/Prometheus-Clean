import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { CreateCompanyDTO } from "../dto/create-company.dto";

type AuthorityRecord = {
  docket_number?: string;
  dot_number?: string;
  legal_name?: string;
  dba_name?: string;
  common_stat?: string;
  contract_stat?: string;
  broker_stat?: string;
};

@Injectable()
export class CompanyAuthorityValidationService {
  private readonly dataHubUrl = "https://data.transportation.gov/resource/6eyk-hxee.json";

  constructor(private readonly configService: ConfigService) {}

  async getBlockingReasons(data: CreateCompanyDTO): Promise<string[]> {
    const reasons = this.getLocalBlockingReasons(data);
    if (reasons.length) {
      return reasons;
    }

    if (this.configService.get<string>("FMCSA_AUTHORITY_VALIDATION") === "off") {
      return [];
    }

    try {
      return await this.getDataHubBlockingReasons(data);
    } catch (error) {
      console.log("FMCSA authority validation unavailable. Continuing with manual review fallback.", error?.message ?? error);
      return [];
    }
  }

  private getLocalBlockingReasons(data: CreateCompanyDTO): string[] {
    const reasons: string[] = [];
    if (!this.cleanNumber(data.dot)) {
      reasons.push("DOT number must include at least one digit.");
    }

    if (!this.cleanNumber(data.mc)) {
      reasons.push("MC number must include at least one digit.");
    }

    if (!data.name?.trim()) {
      reasons.push("Company legal name is required.");
    }

    return reasons;
  }

  private async getDataHubBlockingReasons(data: CreateCompanyDTO): Promise<string[]> {
    const dot = this.cleanNumber(data.dot);
    const mc = this.cleanNumber(data.mc);
    const dotNumber = this.formatDotNumber(dot);
    const docketNumbers = this.formatDocketNumbers(mc);

    const [dotRecords, mcRecords] = await Promise.all([
      this.findRecords("dot_number", dotNumber),
      this.findDocketRecords(docketNumbers)
    ]);

    const reasons: string[] = [];
    const matchingRecord = mcRecords.find((record) => this.normalizeNumber(record.dot_number) === this.normalizeNumber(dot));

    if (!dotRecords.length) {
      reasons.push(`DOT ${data.dot} was not found in the FMCSA authority data.`);
    }

    if (!mcRecords.length) {
      reasons.push(`MC ${data.mc} was not found in the FMCSA authority data.`);
    }

    if (mcRecords.length && !matchingRecord) {
      const firstRecord = mcRecords[0];
      reasons.push(
        `DOT ${data.dot} and MC ${data.mc} do not match. FMCSA lists ${this.formatRecordLabel(firstRecord)}.`
      );
    }

    const authorityRecord = matchingRecord ?? mcRecords[0] ?? dotRecords[0];
    if (authorityRecord) {
      reasons.push(...this.getAuthorityStatusReasons(data.type, authorityRecord));
    }

    return reasons;
  }

  private async findDocketRecords(docketNumbers: string[]): Promise<AuthorityRecord[]> {
    const recordGroups = await Promise.all(docketNumbers.map((docket) => this.findRecords("docket_number", docket)));
    const seen = new Set<string>();
    return recordGroups.flat().filter((record) => {
      const key = `${record.docket_number ?? ""}:${record.dot_number ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async findRecords(field: "dot_number" | "docket_number", value: string): Promise<AuthorityRecord[]> {
    const response = await axios.get<AuthorityRecord[]>(this.dataHubUrl, {
      params: {
        $limit: 5,
        $select: "docket_number,dot_number,legal_name,dba_name,common_stat,contract_stat,broker_stat",
        [field]: value
      },
      timeout: 8000
    });

    return Array.isArray(response.data) ? response.data : [];
  }

  private getAuthorityStatusReasons(companyType: string, record: AuthorityRecord): string[] {
    const type = String(companyType ?? "").toLowerCase();
    const reasons: string[] = [];
    const hasCarrierAuthority = record.common_stat === "A" || record.contract_stat === "A";
    const hasBrokerAuthority = record.broker_stat === "A";

    if ((type === "carrier" || type === "both") && !hasCarrierAuthority) {
      reasons.push(`Carrier authority is not active for ${this.formatRecordLabel(record)}.`);
    }

    if ((type === "broker" || type === "both") && !hasBrokerAuthority) {
      reasons.push(`Broker authority is not active for ${this.formatRecordLabel(record)}.`);
    }

    return reasons;
  }

  private formatRecordLabel(record: AuthorityRecord): string {
    const docket = record.docket_number || "that MC";
    const dot = this.normalizeNumber(record.dot_number) || "unknown DOT";
    const name = record.legal_name || record.dba_name || "unknown company";
    return `${docket} under DOT ${dot} (${name})`;
  }

  private formatDotNumber(value: string): string {
    return value.padStart(8, "0");
  }

  private formatDocketNumbers(value: string): string[] {
    return Array.from(new Set([`MC${value}`, `MC${value.padStart(6, "0")}`]));
  }

  private cleanNumber(value: unknown): string {
    return String(value ?? "").replace(/\D/g, "");
  }

  private normalizeNumber(value: unknown): string {
    const cleaned = this.cleanNumber(value);
    return cleaned.replace(/^0+/, "") || cleaned;
  }
}
