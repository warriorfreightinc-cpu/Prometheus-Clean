import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { timingSafeEqual } from "crypto";
import { Model, Types } from "mongoose";
import { Company } from "../company/interface/company.interface";
import {
  ExternalFreightBatchDTO,
  ExternalFreightItemDTO,
  ExternalOpportunitySearch,
} from "./dto/external-connector.dto";
import { ExternalOpportunity } from "./interface/external-opportunity.interface";

type ConnectorContext = {
  companyId: string;
  integration: any;
};

@Injectable()
export class ExternalConnectorsService {
  constructor(
    @InjectModel("Company") private readonly companyModel: Model<Company>,
    @InjectModel("externalOpportunity")
    private readonly opportunityModel: Model<ExternalOpportunity>,
    private readonly configService: ConfigService
  ) {}

  async ingestWebhook(
    integrationId: string,
    authorization: string | undefined,
    connectorKey: string | undefined,
    batch: ExternalFreightBatchDTO
  ) {
    const context = await this.resolveConnector(integrationId);
    this.verifyWebhookCredential(context.integration, authorization, connectorKey);
    return this.ingestTrustedBatch(context, batch);
  }

  async ingestTrustedBatch(context: ConnectorContext, batch: ExternalFreightBatchDTO) {
    if (!batch?.items?.length) {
      throw new BadRequestException("At least one load or truck is required.");
    }

    const now = new Date();
    const activeExternalIds: Record<"load" | "truck", string[]> = {
      load: [],
      truck: [],
    };
    const errors: Array<{ externalId: string; error: string }> = [];
    let created = 0;
    let updated = 0;
    let removed = 0;

    for (const item of batch.items) {
      const externalId = this.clean(item?.externalId);
      try {
        if (!externalId) {
          throw new BadRequestException("externalId is required.");
        }

        const identity = {
          companyId: context.companyId,
          integrationId: this.idOf(context.integration),
          kind: item.kind,
          externalId,
        };
        const existing = await this.opportunityModel.findOne(identity).lean<any>();

        if (item.status === "removed") {
          if (existing) {
            await this.opportunityModel.updateOne(identity, {
              $set: { status: "removed", lastSeenAt: now },
            });
            removed += 1;
          }
          continue;
        }

        const normalized = this.normalizeItem(context, item, batch, now);
        await this.opportunityModel.findOneAndUpdate(
          identity,
          { $set: normalized },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        activeExternalIds[item.kind].push(externalId);
        existing ? (updated += 1) : (created += 1);
      } catch (error) {
        errors.push({
          externalId: externalId || "unknown",
          error: String(error?.message ?? "Opportunity could not be normalized."),
        });
      }
    }

    const snapshotKinds = Array.from(new Set(batch.items.map((item) => item.kind)));
    const snapshotApplied = Boolean(batch.fullSnapshot && errors.length === 0);
    if (snapshotApplied) {
      for (const kind of snapshotKinds) {
        const result = await this.opportunityModel.updateMany(
          {
            companyId: context.companyId,
            integrationId: this.idOf(context.integration),
            kind,
            status: "active",
            externalId: { $nin: activeExternalIds[kind] },
          },
          { $set: { status: "removed", lastSeenAt: now } }
        );
        removed += Number((result as any)?.modifiedCount ?? (result as any)?.nModified ?? 0);
      }
    }

    return {
      ok: errors.length === 0,
      provider: context.integration.provider,
      integrationId: this.idOf(context.integration),
      received: batch.items.length,
      created,
      updated,
      removed,
      rejected: errors.length,
      snapshotApplied,
      errors,
    };
  }

  async searchForCompany(companyId: string, search: ExternalOpportunitySearch): Promise<any[]> {
    const requestedLimit = Number(search.limit ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 20;
    const query: any = {
      companyId: String(companyId),
      kind: search.kind,
      status: "active",
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    };

    if (search.hazmatMode === "nonHazmat") query.hazmat = false;
    if (search.hazmatMode === "hazmat") query.hazmat = true;
    if (search.originCity) query["origin.place.city"] = this.exactRegex(search.originCity);
    if (search.originState) query["origin.place.state"] = this.exactRegex(search.originState);
    if (search.destinationCity) query["destination.place.city"] = this.exactRegex(search.destinationCity);
    if (search.destinationState) query["destination.place.state"] = this.exactRegex(search.destinationState);
    if (search.maxAgeHours) {
      query.sourceUpdatedAt = {
        $gte: new Date(Date.now() - search.maxAgeHours * 60 * 60 * 1000),
      };
    }
    if (search.maxWeight !== null && search.maxWeight !== undefined) query.weight = { $lte: search.maxWeight };
    if (search.maxLength !== null && search.maxLength !== undefined) query.length = { $lte: search.maxLength };
    if (search.capacity && search.capacity !== "any") query.capacity = { $in: this.capacityVariants(search.capacity) };
    if (search.equipmentCodes?.length) query.equipment = { $in: search.equipmentCodes };

    return this.opportunityModel
      .find(query)
      .sort({ sourceUpdatedAt: -1, lastSeenAt: -1 })
      .limit(limit)
      .lean<any[]>();
  }

  async listForCompany(companyId: string, kind?: "load" | "truck", limit = 100) {
    return this.searchForCompany(companyId, {
      kind: kind ?? "load",
      limit,
    });
  }

  private async resolveConnector(integrationId: string): Promise<ConnectorContext> {
    if (!Types.ObjectId.isValid(integrationId)) {
      throw new NotFoundException("Connector was not found.");
    }
    const company = await this.companyModel
      .findOne({ "integrations._id": integrationId })
      .lean<any>();
    if (!company) {
      throw new NotFoundException("Connector was not found.");
    }

    const integration = (company.integrations ?? []).find(
      (candidate: any) => this.idOf(candidate) === String(integrationId)
    );
    if (!integration) {
      throw new NotFoundException("Connector was not found.");
    }
    if (!["loadboard", "tms"].includes(integration.category)) {
      throw new BadRequestException("This integration cannot ingest freight opportunities.");
    }
    if (integration.enabled === false || integration.status !== "connected") {
      throw new ForbiddenException("This connector is not active.");
    }

    return { companyId: this.idOf(company), integration };
  }

  private verifyWebhookCredential(
    integration: any,
    authorization?: string,
    connectorKey?: string
  ) {
    const credentialRef = this.clean(integration?.credentialRef);
    const expected = credentialRef
      ? this.clean(this.configService.get<string>(credentialRef))
      : "";
    const bearer = String(authorization ?? "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const presented = this.clean(bearer || connectorKey);

    if (!expected || !presented || !this.secureEquals(expected, presented)) {
      throw new UnauthorizedException("Connector credential is invalid.");
    }
  }

  private normalizeItem(
    context: ConnectorContext,
    item: ExternalFreightItemDTO,
    batch: ExternalFreightBatchDTO,
    now: Date
  ) {
    if (!item.kind || !["load", "truck"].includes(item.kind)) {
      throw new BadRequestException("kind must be load or truck.");
    }
    if (!this.hasLocation(item.origin)) {
      throw new BadRequestException("origin requires a city, state, or postalCode.");
    }
    if (item.kind === "load" && !this.hasLocation(item.destination)) {
      throw new BadRequestException("loads require a destination city, state, or postalCode.");
    }

    const sourceUpdatedAt = this.dateOr(item.sourceUpdatedAt, now);
    const contact = this.compactObject({
      name: this.clean(item.contact?.name),
      company: this.clean(item.contact?.company),
      email: this.clean(item.contact?.email),
      phone: this.clean(item.contact?.phone),
    });

    return {
      companyId: context.companyId,
      integrationId: this.idOf(context.integration),
      provider: this.clean(context.integration.provider).toLowerCase(),
      providerLabel: this.clean(context.integration.label) || this.clean(context.integration.provider),
      externalId: this.clean(item.externalId),
      kind: item.kind,
      status: "active",
      origin: this.normalizeLocation(item.origin),
      destination: item.destination ? this.normalizeLocation(item.destination) : undefined,
      pickup: this.normalizeWindow(item.pickup),
      delivery: this.normalizeWindow(item.delivery),
      equipment: this.normalizeEquipment(item.equipment),
      length: this.positiveNumber(item.lengthFeet),
      weight: this.positiveNumber(item.weightLbs),
      commodity: this.clean(item.commodity) || undefined,
      hazmat: typeof item.hazmat === "boolean" ? item.hazmat : null,
      nonHazmat: item.hazmat === false,
      hazmatClass: this.clean(item.hazmatClass) || undefined,
      unNumbers: (item.unNumbers ?? []).map((value) => this.clean(value)).filter(Boolean),
      capacity: this.normalizeCapacity(item.capacity),
      rate: this.positiveNumber(item.rate),
      currency: this.clean(item.currency).toUpperCase() || "USD",
      specialNotes: this.clean(item.specialNotes) || undefined,
      contact,
      booking: this.compactObject({
        mode: item.booking?.mode,
        url: this.clean(item.booking?.url),
        email: this.clean(item.booking?.email),
        phone: this.clean(item.booking?.phone),
      }),
      sourceRequestId: this.clean(batch.sourceRequestId) || undefined,
      sourceUpdatedAt,
      publishedAt: sourceUpdatedAt,
      lastSeenAt: now,
      expiresAt: item.expiresAt ? this.dateOr(item.expiresAt, undefined) : undefined,
    };
  }

  private normalizeLocation(value: any) {
    const latitude = this.finiteNumber(value?.latitude);
    const longitude = this.finiteNumber(value?.longitude);
    const hasCoordinates = latitude !== undefined && longitude !== undefined;
    return {
      type: "place",
      place: {
        city: this.clean(value?.city),
        state: this.clean(value?.state).toUpperCase(),
        zip: this.clean(value?.postalCode),
        country: this.clean(value?.country).toUpperCase() || "US",
      },
      location: hasCoordinates
        ? {
            coordinates: { lat: latitude, lng: longitude },
            geoLocation: { type: "Point", coordinates: [longitude, latitude] },
          }
        : undefined,
    };
  }

  private normalizeWindow(value: any) {
    if (!value) return undefined;
    return this.compactObject({
      earliest: value.earliest ? this.dateOr(value.earliest, undefined) : undefined,
      latest: value.latest ? this.dateOr(value.latest, undefined) : undefined,
      timeZone: this.clean(value.timeZone),
    });
  }

  private normalizeEquipment(values?: string[]) {
    const aliases: Record<string, string> = {
      VAN: "V",
      DRYVAN: "V",
      "DRY VAN": "V",
      REEFER: "R",
      FLATBED: "F",
      "STEP DECK": "SD",
      STEPDECK: "SD",
      "POWER ONLY": "PO",
      POWERONLY: "PO",
    };
    return Array.from(
      new Set(
        (values ?? [])
          .map((value) => this.clean(value).toUpperCase())
          .filter(Boolean)
          .map((value) => aliases[value] ?? value)
      )
    );
  }

  private normalizeCapacity(value?: string) {
    const normalized = this.clean(value).toLowerCase();
    return normalized === "partial" ? "partial" : "full";
  }

  private hasLocation(value: any) {
    return Boolean(this.clean(value?.city) || this.clean(value?.state) || this.clean(value?.postalCode));
  }

  private capacityVariants(value: "full" | "partial") {
    return [value, value.charAt(0).toUpperCase() + value.slice(1), value.toUpperCase()];
  }

  private exactRegex(value: string) {
    return new RegExp(`^${this.escapeRegex(value)}$`, "i");
  }

  private escapeRegex(value: string) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private secureEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private dateOr(value: any, fallback?: Date): Date | undefined {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }

  private finiteNumber(value: any): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private positiveNumber(value: any): number | undefined {
    const number = this.finiteNumber(value);
    return number !== undefined && number >= 0 ? number : undefined;
  }

  private compactObject(value: Record<string, any>) {
    const compacted = Object.entries(value).reduce((result, [key, entry]) => {
      if (entry !== undefined && entry !== null && entry !== "") result[key] = entry;
      return result;
    }, {} as Record<string, any>);
    return Object.keys(compacted).length ? compacted : undefined;
  }

  private clean(value: any) {
    return String(value ?? "").trim();
  }

  private idOf(value: any) {
    return String(value?._id ?? value?.id ?? value ?? "");
  }
}
