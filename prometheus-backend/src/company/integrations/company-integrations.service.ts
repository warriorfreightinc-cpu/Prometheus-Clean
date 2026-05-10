import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { PostBroker } from "src/post-broker/interface/post.interface";
import { PostCarrier } from "src/post-carrier/interface/post.interface";
import { Company, CompanyIntegration } from "../interface/company.interface";
import {
  CompanyIntegrationCategory,
  CompanyIntegrationResponseDTO,
  CompanyIntegrationStatus,
  ExecuteRoomIntegrationDTO,
  RoomIntegrationChoiceCategory,
  RoomIntegrationChoiceDTO,
  RoomIntegrationChoicesDTO,
  RoomIntegrationChoicesQueryDTO,
  RoomIntegrationChoiceSource,
  RoomIntegrationExecutionDTO,
  UpdateCompanyIntegrationDTO,
  UpsertCompanyIntegrationDTO
} from "./dto/company-integration.dto";

@Injectable()
export class CompanyIntegrationsService {
  constructor(
    @InjectModel("Company") private readonly companyModel: Model<Company>,
    @InjectModel("brokerPost") private readonly brokerPostModel: Model<PostBroker>,
    @InjectModel("carrierPost") private readonly carrierPostModel: Model<PostCarrier>
  ) {}

  async listIntegrations(companyId: string): Promise<CompanyIntegrationResponseDTO[]> {
    const company = await this.findCompanyLean(companyId);
    return this.integrationsFor(company).map((integration) => this.sanitizeIntegration(integration));
  }

  async upsertIntegration(companyId: string, user: any, data: UpsertCompanyIntegrationDTO): Promise<CompanyIntegrationResponseDTO> {
    this.assertAdmin(user);
    this.assertValidUpsert(data);

    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const integrations = this.ensureIntegrationsArray(company);
    const provider = this.normalizeProvider(data.provider);
    const existing = integrations.find(
      (integration) => integration.category === data.category && this.normalizeProvider(integration.provider) === provider
    );
    const now = new Date();

    if (existing) {
      this.assignEditableFields(existing, data);
      existing.updatedBy = this.idOf(user);
      existing.updatedAt = now;
      await company.save();
      return this.sanitizeIntegration(existing);
    }

    const integration: CompanyIntegration = {
      _id: new Types.ObjectId().toString(),
      companyId,
      category: data.category,
      provider,
      label: data.label.trim(),
      status: data.status ?? "not_connected",
      enabled: data.enabled ?? true,
      setupUrl: this.optionalTrim(data.setupUrl),
      credentialRef: this.optionalTrim(data.credentialRef),
      notes: this.optionalTrim(data.notes),
      createdBy: this.idOf(user),
      createdAt: now,
      updatedAt: now
    };

    integrations.push(integration);
    await company.save();
    return this.sanitizeIntegration(integration);
  }

  async updateIntegration(
    companyId: string,
    integrationId: string,
    user: any,
    data: UpdateCompanyIntegrationDTO
  ): Promise<CompanyIntegrationResponseDTO> {
    this.assertAdmin(user);
    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const integration = this.findIntegration(company, integrationId);
    this.assignEditableFields(integration, data);
    integration.updatedBy = this.idOf(user);
    integration.updatedAt = new Date();
    await company.save();
    return this.sanitizeIntegration(integration);
  }

  async disableIntegration(companyId: string, integrationId: string, user: any): Promise<CompanyIntegrationResponseDTO> {
    this.assertAdmin(user);
    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const integration = this.findIntegration(company, integrationId);
    integration.enabled = false;
    integration.status = "disabled";
    integration.updatedBy = this.idOf(user);
    integration.updatedAt = new Date();
    await company.save();
    return this.sanitizeIntegration(integration);
  }

  async getRoomIntegrationChoices(query: RoomIntegrationChoicesQueryDTO, user: any): Promise<RoomIntegrationChoicesDTO> {
    const { brokerCompany, carrierCompany } = await this.resolveRoomIntegrationContext(query, user);

    const setupChoices = [
      ...this.activeIntegrations(brokerCompany, "setup").map((integration) => this.toChoice(integration, "broker", "Broker")),
      ...this.activeIntegrations(carrierCompany, "setup").map((integration) => this.toChoice(integration, "carrier", "Carrier"))
    ];

    const trackingChoices = [
      ...this.activeIntegrations(brokerCompany, "tracking").map((integration) => this.toChoice(integration, "broker", "Broker")),
      ...this.activeIntegrations(carrierCompany, "eld").map((integration) => this.toChoice(integration, "carrier", "Carrier")),
      this.manualTrackingChoice()
    ];

    return {
      setupChoices: setupChoices.length ? setupChoices : [this.manualSetupChoice()],
      trackingChoices
    };
  }

  async executeRoomIntegration(body: ExecuteRoomIntegrationDTO, user: any): Promise<RoomIntegrationExecutionDTO> {
    if (!body?.provider || !body?.category) {
      throw new BadRequestException("provider and category are required.");
    }

    const { brokerCompany, carrierCompany } = await this.resolveRoomIntegrationContext(body, user);
    const provider = this.normalizeProvider(body.provider);
    const category = this.normalizeExecutionCategory(body.category);
    const source = this.normalizeExecutionSource(body.source);
    const executionIntegration = this.findExecutionIntegration(brokerCompany, carrierCompany, category, provider, source);
    const integration = executionIntegration?.integration ?? null;
    const integrationSource = executionIntegration?.source ?? source;
    const label = integration
      ? this.withSourcePrefix(integration.label, integrationSource === "carrier" ? "Carrier" : "Broker")
      : this.optionalTrim(body.label) ?? this.providerDisplayLabel(provider);
    const mode = provider === "manual" || category === "manual" ? "manual" : integration ? "configured" : "placeholder";

    return {
      status: "staged",
      mode,
      provider,
      label,
      category,
      source: integrationSource,
      setupUrl: integration?.setupUrl,
      message: this.executionMessage(category, label, mode, integration)
    };
  }

  private assertAdmin(user: any) {
    if (user?.role !== "admin") {
      throw new ForbiddenException("Only company admins can manage integrations.");
    }
  }

  private assertCanReadRoomChoices(
    user: any,
    brokerPost: any,
    carrierPost: any,
    brokerCompanyId: string,
    carrierCompanyId: string
  ) {
    const privilegedRoles = ["admin", "manager", "supervisor"];
    if (privilegedRoles.includes(user?.role)) {
      return;
    }

    const userId = this.idOf(user);
    const userCompanyId = String(user?.companyId ?? "");
    const participantCompanies = [brokerCompanyId, carrierCompanyId];
    const participantUsers = [this.idOf(brokerPost?.publisherId), this.idOf(carrierPost?.publisherId)];

    if ((userCompanyId && participantCompanies.includes(userCompanyId)) || (userId && participantUsers.includes(userId))) {
      return;
    }

    throw new ForbiddenException("Only booking room participants can read integration choices.");
  }

  private assertValidUpsert(data: UpsertCompanyIntegrationDTO) {
    if (!["setup", "tracking", "eld"].includes(data?.category)) {
      throw new BadRequestException("A valid integration category is required.");
    }
    if (!this.optionalTrim(data.provider)) {
      throw new BadRequestException("Provider is required.");
    }
    if (!this.optionalTrim(data.label)) {
      throw new BadRequestException("Label is required.");
    }
  }

  private async resolveRoomIntegrationContext(query: RoomIntegrationChoicesQueryDTO, user: any) {
    if (!query?.brokerPostId || !query?.carrierPostId) {
      throw new BadRequestException("brokerPostId and carrierPostId are required.");
    }

    const [brokerPost, carrierPost] = await Promise.all([
      this.findPostLean(this.brokerPostModel, query.brokerPostId),
      this.findPostLean(this.carrierPostModel, query.carrierPostId)
    ]);

    if (!brokerPost || !carrierPost) {
      throw new NotFoundException("Booking room posts not found.");
    }

    const brokerCompanyId = String(brokerPost.companyId ?? "");
    const carrierCompanyId = String(carrierPost.companyId ?? "");
    if (!brokerCompanyId || !carrierCompanyId) {
      throw new NotFoundException("Booking room companies not found.");
    }
    this.assertCanReadRoomChoices(user, brokerPost, carrierPost, brokerCompanyId, carrierCompanyId);

    const companies = await this.findCompaniesLean([brokerCompanyId, carrierCompanyId]);
    return {
      brokerPost,
      carrierPost,
      brokerCompanyId,
      carrierCompanyId,
      brokerCompany: companies.find((company) => this.idOf(company) === brokerCompanyId),
      carrierCompany: companies.find((company) => this.idOf(company) === carrierCompanyId)
    };
  }

  private assignEditableFields(integration: CompanyIntegration, data: UpdateCompanyIntegrationDTO) {
    if (data.category) integration.category = data.category;
    if (data.provider) integration.provider = this.normalizeProvider(data.provider);
    if (data.label) integration.label = data.label.trim();
    if (typeof data.enabled === "boolean") integration.enabled = data.enabled;
    if (data.status) integration.status = data.status;
    if (data.setupUrl !== undefined) integration.setupUrl = this.optionalTrim(data.setupUrl);
    if (data.credentialRef !== undefined) integration.credentialRef = this.optionalTrim(data.credentialRef);
    if (data.notes !== undefined) integration.notes = this.optionalTrim(data.notes);
  }

  private ensureIntegrationsArray(company: Company): CompanyIntegration[] {
    if (!company.integrations) {
      company.integrations = [];
    }
    return company.integrations;
  }

  private findIntegration(company: Company, integrationId: string): CompanyIntegration {
    const integration = this.ensureIntegrationsArray(company).find((item) => this.idOf(item) === integrationId);
    if (!integration) {
      throw new NotFoundException("Company integration not found.");
    }
    return integration;
  }

  private async findCompanyLean(companyId: string): Promise<any> {
    const query = this.companyModel.findById(companyId);
    const company = typeof (query as any)?.lean === "function" ? await (query as any).lean() : await query;
    if (!company) {
      throw new NotFoundException("Company not found.");
    }
    return company;
  }

  private async findPostLean(model: any, postId: string): Promise<any> {
    const query = model.findById(postId);
    return typeof query?.lean === "function" ? await query.lean() : await query;
  }

  private async findCompaniesLean(companyIds: string[]): Promise<any[]> {
    const uniqueIds = Array.from(new Set(companyIds));
    const query = this.companyModel.find({ _id: { $in: uniqueIds } });
    const companies = typeof (query as any)?.lean === "function" ? await (query as any).lean() : await query;
    return companies ?? [];
  }

  private integrationsFor(company: any): CompanyIntegration[] {
    return company?.integrations ?? [];
  }

  private activeIntegrations(company: any, category: CompanyIntegrationCategory): CompanyIntegration[] {
    return this.integrationsFor(company).filter(
      (integration) => integration.category === category && integration.enabled !== false && integration.status === "connected"
    );
  }

  private findExecutionIntegration(
    brokerCompany: any,
    carrierCompany: any,
    category: RoomIntegrationChoiceCategory,
    provider: string,
    source: RoomIntegrationChoiceSource
  ): { integration: CompanyIntegration; source: "broker" | "carrier" } | null {
    if (category === "manual" || provider === "manual") {
      return null;
    }

    const companyCandidates: Array<{ company: any; source: "broker" | "carrier" }> = source === "carrier"
      ? [{ company: carrierCompany, source: "carrier" }]
      : source === "broker"
        ? [{ company: brokerCompany, source: "broker" }]
        : [{ company: brokerCompany, source: "broker" }, { company: carrierCompany, source: "carrier" }];
    const categoryCandidates: CompanyIntegrationCategory[] = category === "tracking"
      ? ["tracking", "eld"]
      : category === "eld"
        ? ["eld"]
        : ["setup"];

    for (const candidate of companyCandidates) {
      const integration = this.integrationsFor(candidate.company).find((item) => (
        categoryCandidates.includes(item.category)
        && this.normalizeProvider(item.provider) === provider
        && item.enabled !== false
        && item.status === "connected"
      ));
      if (integration) return { integration, source: candidate.source };
    }

    return null;
  }

  private toChoice(integration: CompanyIntegration, source: "broker" | "carrier", sourceLabel: "Broker" | "Carrier"): RoomIntegrationChoiceDTO {
    return {
      id: this.idOf(integration),
      companyId: integration.companyId,
      source,
      category: integration.category,
      provider: integration.provider,
      label: this.withSourcePrefix(integration.label, sourceLabel),
      setupUrl: integration.setupUrl
    };
  }

  private manualSetupChoice(): RoomIntegrationChoiceDTO {
    return {
      source: "manual",
      category: "manual",
      provider: "manual",
      label: "Manual packet"
    };
  }

  private manualTrackingChoice(): RoomIntegrationChoiceDTO {
    return {
      source: "manual",
      category: "manual",
      provider: "manual",
      label: "Manual tracking update"
    };
  }

  private normalizeExecutionCategory(category: RoomIntegrationChoiceCategory): RoomIntegrationChoiceCategory {
    return ["setup", "tracking", "eld", "manual"].includes(category) ? category : "manual";
  }

  private normalizeExecutionSource(source?: RoomIntegrationChoiceSource): RoomIntegrationChoiceSource {
    return source === "broker" || source === "carrier" || source === "manual" ? source : "manual";
  }

  private providerDisplayLabel(provider: string): string {
    if (provider === "highway") return "Highway";
    if (provider === "mycarrierpacket") return "MyCarrierPacket";
    if (provider === "truckstop") return "Truckstop";
    if (provider === "macropoint") return "MacroPoint";
    if (provider === "fourkites") return "FourKites";
    if (provider === "tql") return "TQL tracking";
    if (provider === "manual") return "Manual";
    return provider
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private executionMessage(
    category: RoomIntegrationChoiceCategory,
    label: string,
    mode: "configured" | "placeholder" | "manual",
    integration: CompanyIntegration | null
  ): string {
    if (category === "setup") {
      const suffix = mode === "configured" && integration?.setupUrl
        ? " The setup portal link is ready for this booking."
        : " Add live credentials or a setup URL in Company Integrations to send it through the provider automatically.";
      return `${label} setup is staged.${suffix}`;
    }

    if (category === "tracking" || category === "eld") {
      const suffix = mode === "configured" && integration?.credentialRef
        ? " The live connector reference is ready for this booking."
        : " Add live credentials in Company Integrations to send the tracking request automatically.";
      return `${label} tracking is staged.${suffix}`;
    }

    return `${label} is staged as a manual booking step.`;
  }

  private sanitizeIntegration(integration: CompanyIntegration): CompanyIntegrationResponseDTO {
    return {
      id: this.idOf(integration),
      companyId: integration.companyId,
      category: integration.category,
      provider: integration.provider,
      label: integration.label,
      status: integration.status,
      enabled: integration.enabled !== false,
      setupUrl: integration.setupUrl,
      notes: integration.notes,
      createdBy: integration.createdBy,
      updatedBy: integration.updatedBy,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt
    };
  }

  private normalizeProvider(provider: string): string {
    return provider.trim().toLowerCase();
  }

  private optionalTrim(value?: string): string | undefined {
    const nextValue = value?.trim();
    return nextValue ? nextValue : undefined;
  }

  private withSourcePrefix(label: string, prefix: "Broker" | "Carrier"): string {
    return label.startsWith(`${prefix} `) ? label : `${prefix} ${label}`;
  }

  private idOf(value: any): string {
    if (typeof value === "string") {
      return value;
    }
    return String(value?._id ?? value?.id ?? "");
  }
}
