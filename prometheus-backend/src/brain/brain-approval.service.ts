import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BrainEventService } from "./brain-event.service";
import { BrainMemoryService } from "./brain-memory.service";
import {
  CreatePrometheusBrainApproval,
  PrometheusBrainApproval,
} from "./interface/prometheus-brain-approval.interface";

@Injectable()
export class BrainApprovalService {
  constructor(
    @InjectModel("prometheusBrainApproval")
    private readonly approvalModel: Model<any>,
    private readonly events: BrainEventService,
    @Optional()
    @Inject(forwardRef(() => BrainMemoryService))
    private readonly memory?: BrainMemoryService
  ) {}

  async createRequest(input: CreatePrometheusBrainApproval) {
    const approval = await this.approvalModel.create({
      ...input,
      status: "pending",
    });
    await this.events.record({
      companyId: input.companyId,
      userId: input.requestedBy,
      role: input.role,
      source: "matching",
      type: "approvalRequested",
      intent: input.actionType,
      message: input.summary,
      payload: input.payload,
    });
    return approval;
  }

  async listForCompany(companyId: string, limit = 100) {
    return this.approvalModel
      .find({ companyId: String(companyId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<any[]>();
  }

  async approve(approvalId: string, user: any) {
    const approval = await this.findCompanyApproval(approvalId, user);
    if (approval.status !== "pending") {
      throw new BadRequestException("This approval is not pending.");
    }

    let status: "approved" | "executed" = "approved";
    let result: Record<string, unknown> = {
      providerStatus: "pending_provider_connection",
      message: "Approved. Provider execution is not connected in Brain V1.",
    };

    if (approval.actionType === "saveMemory") {
      if (!this.memory) {
        throw new BadRequestException("Memory execution is not available.");
      }
      const saved = await this.memory.saveApprovedMemory(approval, user);
      status = "executed";
      result = {
        memoryId: String(saved?._id ?? ""),
        message: "Memory saved.",
      };
    }

    const updated = await this.approvalModel
      .findByIdAndUpdate(
        approvalId,
        {
          status,
          result,
          decidedBy: String(user._id),
          decisionAt: new Date(),
        },
        { new: true }
      )
      .lean<any>();

    await this.events.record({
      companyId: String(user.companyId),
      userId: String(user._id),
      role: String(user.role),
      source: "matching",
      type: "approvalAccepted",
      intent: approval.actionType,
      message: approval.summary,
      payload: approval.payload,
    });

    await this.events.record({
      companyId: String(user.companyId),
      userId: String(user._id),
      role: String(user.role),
      source: "matching",
      type: "actionExecuted",
      intent: approval.actionType,
      message: String(result.message ?? "Approved."),
      payload: result,
    });

    return updated;
  }

  async reject(approvalId: string, user: any) {
    const approval = await this.findCompanyApproval(approvalId, user);
    if (approval.status !== "pending") {
      throw new BadRequestException("This approval is not pending.");
    }

    const updated = await this.approvalModel
      .findByIdAndUpdate(
        approvalId,
        {
          status: "rejected",
          decidedBy: String(user._id),
          decisionAt: new Date(),
        },
        { new: true }
      )
      .lean<any>();

    await this.events.record({
      companyId: String(user.companyId),
      userId: String(user._id),
      role: String(user.role),
      source: "matching",
      type: "approvalRejected",
      intent: approval.actionType,
      message: approval.summary,
      payload: approval.payload,
    });

    return updated;
  }

  private async findCompanyApproval(
    approvalId: string,
    user: any
  ): Promise<PrometheusBrainApproval> {
    const approval = await this.approvalModel.findById(approvalId).lean<any>();
    if (!approval) {
      throw new NotFoundException("Approval request not found.");
    }
    if (String(approval.companyId) !== String(user?.companyId ?? "")) {
      throw new ForbiddenException("Approval request belongs to another company.");
    }
    return approval;
  }
}
