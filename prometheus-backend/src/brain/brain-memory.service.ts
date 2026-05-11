import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BrainApprovalService } from "./brain-approval.service";
import { BrainEventService } from "./brain-event.service";
import { normalizeBrainSettings } from "./brain-settings.util";
import { PrometheusBrainApproval } from "./interface/prometheus-brain-approval.interface";

export interface BrainSaveMemoryInput {
  companyId: string;
  userId: string;
  role: string;
  content: string;
  scope: string;
  subjectKey: string;
  subjectLabel: string;
  tags?: string[];
}

@Injectable()
export class BrainMemoryService {
  constructor(
    @InjectModel("prometheusBrainMemory")
    private readonly memoryModel: Model<any>,
    @InjectModel("Company")
    private readonly companyModel: Model<any>,
    private readonly approvals: BrainApprovalService,
    private readonly events: BrainEventService
  ) {}

  async getCompanySettings(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean<any>();
    return normalizeBrainSettings(company?.brainSettings);
  }

  async updateCompanySettings(companyId: string, userId: string, data: any) {
    const nextSettings = normalizeBrainSettings(data);
    return this.companyModel
      .findByIdAndUpdate(
        companyId,
        {
          brainSettings: {
            ...nextSettings,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        },
        { new: true }
      )
      .lean<any>();
  }

  async requestSaveMemory(input: BrainSaveMemoryInput) {
    const settings = await this.getCompanySettings(input.companyId);
    if (settings.memoryMode === "off") {
      return {
        blocked: true,
        message:
          "Company memory is off. I can use this in the current conversation, but I will not save it.",
      };
    }

    await this.events.record({
      companyId: input.companyId,
      userId: input.userId,
      role: input.role,
      source: "matching",
      type: "memoryRequested",
      intent: "saveMemory",
      message: input.content,
      payload: { ...input },
    });

    return this.approvals.createRequest({
      companyId: input.companyId,
      requestedBy: input.userId,
      role: input.role,
      actionType: "saveMemory",
      label: "Save company memory",
      summary: `Approve saving this Prometheus memory: ${input.content}`,
      riskNote:
        "Saved memory may influence future dispatch and broker suggestions for this company.",
      payload: { ...input },
    });
  }

  async saveApprovedMemory(approval: PrometheusBrainApproval, user: any) {
    if (approval.actionType !== "saveMemory") {
      throw new BadRequestException("Approval is not a save-memory request.");
    }

    const payload: any = approval.payload ?? {};
    const saved = await this.memoryModel.create({
      companyId: String(approval.companyId),
      createdBy: String(approval.requestedBy),
      approvedBy: String(user?._id ?? ""),
      scope: payload.scope || "company",
      subjectKey: payload.subjectKey || String(approval.companyId),
      subjectLabel: payload.subjectLabel || "Company preference",
      content: payload.content || "",
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      sourceApprovalId: String(approval._id ?? ""),
      active: true,
    });

    await this.events.record({
      companyId: String(approval.companyId),
      userId: String(user?._id ?? ""),
      role: String(user?.role ?? ""),
      source: "matching",
      type: "memorySaved",
      intent: "saveMemory",
      message: payload.content || "",
      payload,
    });

    return saved;
  }

  async listForCompany(companyId: string) {
    return this.memoryModel
      .find({ companyId: String(companyId), active: true })
      .sort({ updatedAt: -1 })
      .lean<any[]>();
  }
}
