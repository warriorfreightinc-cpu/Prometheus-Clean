import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { parseAgentCommand, ParsedAgentCommand } from "./agent-command-parser";

export interface AgentCommandResult {
  handled: boolean;
  message: string;
  sourcePostId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AgentCommandService {
  constructor(
    @InjectModel("brokerPost") private readonly brokerPostModel: Model<any>,
    @InjectModel("carrierPost") private readonly carrierPostModel: Model<any>,
    @InjectModel("Company") private readonly companyModel: Model<any>
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
    const results = await target.model
      .find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(parsed.limit ?? 20)
      .lean<any[]>();

    if (!results.length && parsed.equipmentCodes?.length) {
      const alternativeQuery = this.buildEquipmentAlternativeQuery(query, parsed.equipmentCodes);
      if (alternativeQuery) {
        const alternativeResults = await target.model
          .find(alternativeQuery)
          .sort({ publishedAt: -1, createdAt: -1 })
          .limit(parsed.limit ?? 20)
          .lean<any[]>();
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
        mapRequested: Boolean(parsed.mapRequested),
      },
    };
  }

  private async targetForUser(user: any): Promise<{ label: "load" | "truck"; model: Model<any> } | null> {
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

  private targetForRole(role: string): { label: "load" | "truck"; model: Model<any> } | null {
    if (role === "carrier") {
      return { label: "load", model: this.brokerPostModel };
    }
    if (role === "broker") {
      return { label: "truck", model: this.carrierPostModel };
    }
    return null;
  }

  private buildQuery(parsed: ParsedAgentCommand, user: any) {
    const query: any = {
      companyId: { $ne: String(user?.companyId ?? "") },
      nonHazmat: { $ne: true },
    };

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
      return `I do not see matching hazmat ${label}s ${filters || "for that search"} yet.${mapNote}`;
    }

    const lines = results.slice(0, 5).map((post, index) => {
      const lane = this.formatLane(post);
      const equipment = this.formatEquipment(post.equipment);
      const weight = this.formatWeight(post.weight);
      const rate = this.formatRate(post.rate);
      return `${index + 1}. ${lane} | ${equipment}${weight ? ` | ${weight}` : ""}${rate ? ` | ${rate}` : ""}`;
    });
    const more = results.length > lines.length
      ? `\nI have ${results.length - lines.length} more in this first set. Say "show more" to keep going.`
      : "";
    const mapNote = parsed.mapRequested
      ? "\nI can use these results for the map view so you can see the nearby clusters around the truck."
      : "";

    return `I found ${results.length} hazmat ${plural} ${filters || "for that search"}.\n${lines.join("\n")}${more}${mapNote}`;
  }

  private renderEquipmentAlternativeMessage(
    parsed: ParsedAgentCommand,
    results: any[],
    label: "load" | "truck"
  ): string {
    const requested = parsed.equipmentCodes?.join("/") || "requested equipment";
    const alternatives = this.permissionAlternativeEquipment(parsed.equipmentCodes ?? []).join("/");
    const plural = results.length === 1 ? "alternative" : "alternatives";
    const origin = this.formatParsedPlace(parsed.originCity, parsed.originState);
    const destination = this.formatParsedPlace(parsed.destinationCity, parsed.destinationState);
    const city = destination
      ? `${origin || "anywhere"} to ${destination}`
      : origin || "that area";
    const counterpart = label === "load" ? "broker" : "carrier";
    const lines = results.slice(0, 5).map((post, index) => {
      const lane = this.formatLane(post);
      const equipment = this.formatEquipment(post.equipment);
      const weight = this.formatWeight(post.weight);
      const rate = this.formatRate(post.rate);
      return `${index + 1}. ${lane} | ${equipment}${weight ? ` | ${weight}` : ""}${rate ? ` | ${rate}` : ""}`;
    });

    return `No exact ${requested} hazmat ${label}s out of ${city} right now. I found ${results.length} permission-based ${alternatives} ${plural}. I can ask the ${counterpart} if this equipment substitution can work.\n${lines.join("\n")}`;
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
