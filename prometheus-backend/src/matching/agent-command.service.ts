import { Injectable, Optional } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ExternalOpportunitySearch } from "../external-connectors/dto/external-connector.dto";
import { ExternalConnectorsService } from "../external-connectors/external-connectors.service";
import { parseAgentCommand, ParsedAgentCommand } from "./agent-command-parser";

export interface AgentCommandResult {
  handled: boolean;
  message: string;
  sourcePostId?: string;
  metadata?: Record<string, any>;
}

type AgentSearchTarget = {
  label: "load" | "truck";
  model: Model<any>;
};

@Injectable()
export class AgentCommandService {
  constructor(
    @InjectModel("brokerPost") private readonly brokerPostModel: Model<any>,
    @InjectModel("carrierPost") private readonly carrierPostModel: Model<any>,
    @InjectModel("Company") private readonly companyModel: Model<any>,
    @Optional() private readonly externalConnectors?: ExternalConnectorsService
  ) {}

  async handlePrompt(prompt: string, user: any): Promise<AgentCommandResult> {
    const parsed = parseAgentCommand(prompt);
    if (parsed.intent === "unknown") {
      return { handled: false, message: "" };
    }

    if (parsed.intent === "showMore") {
      return {
        handled: true,
        message: "I can show more once there is an active search result in this conversation. For now, tell me the city, weight, equipment, or time window you want me to check.",
        metadata: { commandType: "showMore" },
      };
    }

    const target = await this.targetForUser(user);
    if (!target) {
      return {
        handled: true,
        message: "Prometheus can search hazmat loads and trucks from a broker or carrier workspace.",
        metadata: { commandType: "unsupportedRole" },
      };
    }

    const query = this.buildQuery(parsed, user);
    const search = await this.searchTarget(target, query, parsed, user);
    const results = search.results;

    if (!results.length && parsed.equipmentCodes?.length) {
      const alternativeQuery = this.buildEquipmentAlternativeQuery(query, parsed.equipmentCodes);
      if (alternativeQuery) {
        const alternatives = this.permissionAlternativeEquipment(parsed.equipmentCodes);
        const alternativeSearch = await this.searchTarget(
          target,
          alternativeQuery,
          parsed,
          user,
          alternatives
        );
        const alternativeResults = alternativeSearch.results;
        if (alternativeResults.length) {
          return {
            handled: true,
            message: this.renderEquipmentAlternativeMessage(parsed, alternativeResults, target.label),
            metadata: {
              commandType: "search",
              targetType: target.label,
              resultCount: alternativeResults.length,
              exactResultCount: 0,
              alternativeEquipment: true,
              internalResultCount: alternativeSearch.internalCount,
              externalResultCount: alternativeSearch.externalCount,
              mapRequested: Boolean(parsed.mapRequested),
            },
          };
        }
      }
    }

    return {
      handled: true,
      message: this.renderSearchMessage(parsed, results, target.label),
      metadata: {
        commandType: "search",
        targetType: target.label,
        resultCount: results.length,
        internalResultCount: search.internalCount,
        externalResultCount: search.externalCount,
        mapRequested: Boolean(parsed.mapRequested),
      },
    };
  }

  private async targetForUser(user: any): Promise<AgentSearchTarget | null> {
    const directTarget = this.targetForRole(String(user?.role ?? ""));
    if (directTarget) {
      return directTarget;
    }

    const companyId = String(user?.companyId ?? "").trim();
    if (!companyId) {
      return null;
    }

    const company = await this.companyModel.findById(companyId).lean<any>();
    return this.targetForRole(String(company?.type ?? ""));
  }

  private targetForRole(role: string): AgentSearchTarget | null {
    if (role === "carrier") {
      return { label: "load", model: this.brokerPostModel };
    }
    if (role === "broker") {
      return { label: "truck", model: this.carrierPostModel };
    }
    return null;
  }

  private async searchTarget(
    target: AgentSearchTarget,
    internalQuery: any,
    parsed: ParsedAgentCommand,
    user: any,
    equipmentCodes = parsed.equipmentCodes
  ): Promise<{ results: any[]; internalCount: number; externalCount: number }> {
    const limit = parsed.limit ?? 20;
    const internalPromise = target.model
      .find(internalQuery)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean<any[]>();
    const externalPromise = this.externalConnectors
      ? this.externalConnectors
          .searchForCompany(String(user?.companyId ?? ""), {
            kind: target.label,
            hazmatMode: parsed.hazmatMode === "nonHazmat" ? "nonHazmat" : "hazmat",
            originCity: parsed.originCity,
            originState: parsed.originState,
            destinationCity: parsed.destinationCity,
            destinationState: parsed.destinationState,
            maxAgeHours: parsed.maxAgeHours,
            maxWeight: parsed.maxWeight,
            maxLength: parsed.maxLength,
            capacity: parsed.capacity,
            equipmentCodes,
            limit,
          } as ExternalOpportunitySearch)
          .catch(() => [])
      : Promise.resolve([]);

    const [internalResults, externalResults] = await Promise.all([
      internalPromise,
      externalPromise,
    ]);
    const taggedExternal = externalResults.map((result) => ({
      ...result,
      _externalOpportunity: true,
    }));
    const results = [...internalResults, ...taggedExternal]
      .sort((left, right) => this.resultTimestamp(right) - this.resultTimestamp(left))
      .slice(0, limit);

    return {
      results,
      internalCount: internalResults.length,
      externalCount: externalResults.length,
    };
  }

  private buildQuery(parsed: ParsedAgentCommand, user: any) {
    const query: any = {
      companyId: { $ne: String(user?.companyId ?? "") },
    };

    if (parsed.hazmatMode === "nonHazmat") {
      query.nonHazmat = true;
    } else {
      query.nonHazmat = { $ne: true };
    }

    if (parsed.originCity) {
      query["origin.place.city"] = new RegExp(`^${this.escapeRegex(parsed.originCity)}$`, "i");
    }
    if (parsed.originState) {
      query["origin.place.state"] = new RegExp(`^${this.escapeRegex(parsed.originState)}$`, "i");
    }
    if (parsed.destinationCity) {
      query["destination.place.city"] = new RegExp(`^${this.escapeRegex(parsed.destinationCity)}$`, "i");
    }
    if (parsed.destinationState) {
      query["destination.place.state"] = new RegExp(`^${this.escapeRegex(parsed.destinationState)}$`, "i");
    }
    if (parsed.maxAgeHours) {
      query.publishedAt = {
        $gte: new Date(Date.now() - parsed.maxAgeHours * 60 * 60 * 1000),
      };
    }
    if (parsed.maxWeight !== null && parsed.maxWeight !== undefined) {
      query.weight = { $lte: parsed.maxWeight };
    }
    if (parsed.maxLength !== null && parsed.maxLength !== undefined) {
      query.length = { $lte: parsed.maxLength };
    }
    if (parsed.capacity && parsed.capacity !== "any") {
      query.capacity = { $in: this.capacityVariants(parsed.capacity) };
    }
    if (parsed.equipmentCodes?.length) {
      query.equipment = { $in: parsed.equipmentCodes };
    }

    return query;
  }

  private buildEquipmentAlternativeQuery(query: any, equipmentCodes: string[]) {
    const alternatives = this.permissionAlternativeEquipment(equipmentCodes);
    if (!alternatives.length) {
      return null;
    }
    return {
      ...query,
      equipment: { $in: alternatives },
    };
  }

  private renderSearchMessage(
    parsed: ParsedAgentCommand,
    results: any[],
    label: "load" | "truck"
  ): string {
    const plural = results.length === 1 ? label : `${label}s`;
    const freightType = this.freightTypeLabel(parsed);
    const origin = this.formatParsedPlace(parsed.originCity, parsed.originState);
    const destination = this.formatParsedPlace(parsed.destinationCity, parsed.destinationState);
    const lane = destination
      ? `out of ${origin || "anywhere"} to ${destination}`
      : origin
      ? `out of ${origin}`
      : "";
    const filters = [
      lane,
      parsed.maxAgeHours ? `from the last ${parsed.maxAgeHours} hours` : "",
      parsed.maxWeight ? `under ${parsed.maxWeight.toLocaleString()} lb` : "",
      parsed.maxLength ? `under ${parsed.maxLength} ft` : "",
      parsed.capacity && parsed.capacity !== "any" ? `${parsed.capacity} only` : "",
      parsed.equipmentCodes?.length ? `${parsed.equipmentCodes.join("/")} equipment` : "",
    ].filter(Boolean).join(" ");

    if (!results.length) {
      const mapNote = parsed.mapRequested
        ? " I can still open the map view once a truck/load context is selected."
        : "";
      return `I do not see matching ${freightType} ${label}s ${filters || "for that search"} yet.${mapNote}`;
    }

    if (parsed.rateRequested) {
      return this.renderRateMessage(parsed, results, label, filters, freightType);
    }

    const lines = results.slice(0, 10).map((post, index) => {
      const lane = this.formatLane(post);
      const equipment = this.formatEquipment(post.equipment);
      const weight = this.formatWeight(post.weight);
      const rate = this.formatRate(post.rate);
      const source = this.formatSource(post);
      return `${index + 1}. ${lane} | ${equipment}${weight ? ` | ${weight}` : ""}${rate ? ` | ${rate}` : ""}${source}`;
    });
    const more = results.length > lines.length
      ? `\nI have ${results.length - lines.length} more in this first set. Say "show more" to keep going.`
      : "";
    const mapNote = parsed.mapRequested
      ? "\nI can use these results for the map view so you can see the nearby clusters around the truck."
      : "";

    return `I found ${results.length} ${freightType} ${plural} ${filters || "for that search"}.\n${lines.join("\n")}${more}${mapNote}`;
  }

  private renderRateMessage(
    parsed: ParsedAgentCommand,
    results: any[],
    label: "load" | "truck",
    filters: string,
    freightType: string
  ): string {
    const plural = results.length === 1 ? label : `${label}s`;
    const lines = results.slice(0, 10).map((post, index) => {
      const lane = this.formatLane(post);
      const equipment = this.formatEquipment(post.equipment);
      const weight = this.formatWeight(post.weight);
      const rate = this.formatRate(post.rate) || "Rate not posted";
      return `${index + 1}. ${lane} | ${equipment}${weight ? ` | ${weight}` : ""} | ${rate}${this.formatSource(post)}`;
    });
    const more = results.length > lines.length
      ? `\nI have ${results.length - lines.length} more in this first set. Say "show more" to keep going.`
      : "";

    return `Rate check for ${results.length} ${freightType} ${plural} ${filters || "for that search"}.\n${lines.join("\n")}${more}`;
  }

  private renderEquipmentAlternativeMessage(
    parsed: ParsedAgentCommand,
    results: any[],
    label: "load" | "truck"
  ): string {
    const requested = parsed.equipmentCodes?.join("/") || "requested equipment";
    const alternatives = this.permissionAlternativeEquipment(parsed.equipmentCodes ?? []).join("/");
    const plural = results.length === 1 ? "alternative" : "alternatives";
    const freightType = this.freightTypeLabel(parsed);
    const origin = this.formatParsedPlace(parsed.originCity, parsed.originState);
    const destination = this.formatParsedPlace(parsed.destinationCity, parsed.destinationState);
    const city = destination
      ? `${origin || "anywhere"} to ${destination}`
      : origin || "that area";
    const counterpart = label === "load" ? "broker" : "carrier";
    const lines = results.slice(0, 10).map((post, index) => {
      const lane = this.formatLane(post);
      const equipment = this.formatEquipment(post.equipment);
      const weight = this.formatWeight(post.weight);
      const rate = this.formatRate(post.rate);
      return `${index + 1}. ${lane} | ${equipment}${weight ? ` | ${weight}` : ""}${rate ? ` | ${rate}` : ""}${this.formatSource(post)}`;
    });

    return `No exact ${requested} ${freightType} ${label}s out of ${city} right now. I found ${results.length} permission-based ${alternatives} ${plural}. I can ask the ${counterpart} if this equipment substitution can work.\n${lines.join("\n")}`;
  }

  private freightTypeLabel(parsed: ParsedAgentCommand): string {
    return parsed.hazmatMode === "nonHazmat" ? "non-hazmat" : "hazmat";
  }

  private formatLane(post: any): string {
    const origin = this.formatPlace(post?.origin);
    const destination = this.formatPlace(post?.destination);
    return destination ? `${origin} to ${destination}` : origin;
  }

  private formatPlace(place: any): string {
    const city = String(place?.place?.city ?? "").trim();
    const state = String(place?.place?.state ?? "").trim();
    return [city, state].filter(Boolean).join(", ") || "Unknown";
  }

  private formatParsedPlace(city: any, state: any): string {
    return [city, state]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }

  private formatEquipment(value: any): string {
    const items = Array.isArray(value) ? value : [value];
    return items.map((item) => String(item ?? "").trim()).filter(Boolean).join("/") || "equipment not listed";
  }

  private formatWeight(value: any): string {
    const weight = Number(value);
    return Number.isFinite(weight) ? `${weight.toLocaleString()} lb` : "";
  }

  private formatRate(value: any): string {
    const rate = Number(value);
    return Number.isFinite(rate) && rate > 0 ? `$${rate.toLocaleString()}` : "";
  }

  private formatSource(post: any): string {
    const source = String(post?.providerLabel ?? post?.provider ?? "").trim();
    return post?._externalOpportunity && source ? ` | Source: ${source}` : "";
  }

  private resultTimestamp(post: any): number {
    const value = post?.sourceUpdatedAt ?? post?.publishedAt ?? post?.updatedAt ?? post?.createdAt;
    const timestamp = new Date(value ?? 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private capacityVariants(value: "full" | "partial") {
    return [
      value,
      value.charAt(0).toUpperCase() + value.slice(1),
      value.toUpperCase(),
    ];
  }

  private permissionAlternativeEquipment(equipmentCodes: string[]): string[] {
    if (equipmentCodes.includes("RZ")) {
      return ["VZ", "V"];
    }
    if (equipmentCodes.includes("VZ")) {
      return ["RZ", "R"];
    }
    return [];
  }

  private escapeRegex(value: string): string {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
