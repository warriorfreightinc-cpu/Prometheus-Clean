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
    @InjectModel("carrierPost") private readonly carrierPostModel: Model<any>
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

    const target = this.targetForRole(user?.role);
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

    return query;
  }

  private renderSearchMessage(
    parsed: ParsedAgentCommand,
    results: any[],
    label: "load" | "truck"
  ): string {
    const plural = results.length === 1 ? label : `${label}s`;
    const location = [parsed.originCity, parsed.originState].filter(Boolean).join(", ");
    const filters = [
      location ? `out of ${location}` : "",
      parsed.maxAgeHours ? `from the last ${parsed.maxAgeHours} hours` : "",
      parsed.maxWeight ? `under ${parsed.maxWeight.toLocaleString()} lb` : "",
      parsed.maxLength ? `under ${parsed.maxLength} ft` : "",
      parsed.capacity && parsed.capacity !== "any" ? `${parsed.capacity} only` : "",
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

  private escapeRegex(value: string): string {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
