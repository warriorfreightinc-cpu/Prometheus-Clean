import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import * as fs from "fs";
import { Model } from "mongoose";
import * as nodemailer from "nodemailer";
import { User } from "src/user/interface/user.interface";
import { Company } from "../interface/company.interface";
import { History } from "../interface/history.interface";
import {
  COMPANY_ONBOARDING_STATUSES,
  ONBOARDING_DOCUMENT_STATUS,
  OnboardingDocumentType,
  OnboardingQueueGroup,
  VERIFICATION_SOURCES
} from "./onboarding.constants";
import {
  InactivateCompanyDTO,
  RejectOnboardingDocumentDTO,
  RequestCorrectionDTO,
  RestoreCompanyDTO,
  SoftDeleteCompanyDTO,
  VerifyOnboardingDocumentDTO
} from "./dto/onboarding-action.dto";
import { canApproveOnboardingDocuments, getQueueStatuses } from "./onboarding.utils";

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel("Company") private readonly companyModel: Model<Company>,
    @InjectModel("User") private readonly userModel: Model<User>,
    @InjectModel("History") private readonly historyModel: Model<History>,
    private readonly configService: ConfigService
  ) {}

  async getQueue(group: OnboardingQueueGroup) {
    const query: any = {
      status: { $in: getQueueStatuses(group) }
    };

    if (group !== "inactive") {
      query.deletedAt = { $exists: false };
    }

    return this.companyModel
      .find(query)
      .sort({ isWaiting: -1, createdAt: -1 })
      .lean();
  }

  async getDetail(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) {
      throw new NotFoundException("Company not found.");
    }
    return company;
  }

  async submitForReview(companyId: string, requestedSeats = 1) {
    const now = new Date();
    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.PendingReview,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.PendingReview,
          "onboarding.submittedAt": now,
          "onboarding.requestedSeats": requestedSeats
        },
        $push: {
          notes: {
            text: "Company submitted onboarding request.",
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, { email: company.email }, "onboarding_submitted", "Company submitted onboarding request.", { requestedSeats });
    return company;
  }

  async verifyDocument(
    companyId: string,
    documentType: OnboardingDocumentType,
    data: VerifyOnboardingDocumentDTO,
    actor: any
  ) {
    const path = this.buildDocumentPath(documentType);
    const now = new Date();
    const displayName = this.getDocumentDisplayName(documentType);
    const update = {
      $set: {
        [`${path}.fileType`]: documentType,
        [`${path}.displayName`]: displayName,
        [`${path}.source`]: data.source ?? VERIFICATION_SOURCES.Manual,
        [`${path}.status`]: ONBOARDING_DOCUMENT_STATUS.Verified,
        [`${path}.verifiedAt`]: now,
        [`${path}.verifiedBy`]: this.actorId(actor),
        [`${path}.notes`]: data.notes ?? ""
      },
      $push: {
        notes: {
          text: `${displayName} verified by ${actor?.firstName ?? "Master"} ${actor?.lastName ?? ""}`.trim(),
          type: "action",
          date: now
        }
      }
    } as any;

    if (data.expirationDate) {
      update.$set[`${path}.expirationDate`] = new Date(data.expirationDate);
    }

    const company = await this.companyModel.findOneAndUpdate({ _id: companyId }, update, { new: true });
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "document_verified", `${displayName} marked verified.`, { documentType });
    return company;
  }

  async rejectDocument(
    companyId: string,
    documentType: OnboardingDocumentType,
    data: RejectOnboardingDocumentDTO,
    actor: any
  ) {
    const path = this.buildDocumentPath(documentType);
    const now = new Date();
    const displayName = this.getDocumentDisplayName(documentType);

    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          [`${path}.fileType`]: documentType,
          [`${path}.displayName`]: displayName,
          [`${path}.source`]: VERIFICATION_SOURCES.Manual,
          [`${path}.status`]: ONBOARDING_DOCUMENT_STATUS.Rejected,
          [`${path}.rejectedAt`]: now,
          [`${path}.rejectedBy`]: this.actorId(actor),
          [`${path}.rejectionReason`]: data.reason,
          [`${path}.notes`]: data.notes ?? ""
        },
        $push: {
          notes: {
            text: `${displayName} rejected: ${data.reason}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "document_rejected", `${displayName} rejected.`, { documentType, reason: data.reason });
    return company;
  }

  async approvePaperwork(companyId: string, actor: any) {
    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const approval = canApproveOnboardingDocuments(company.type, company.onboarding as any);
    if (!approval.ok) {
      const missing = [...approval.missing, ...approval.rejected].join(", ");
      throw new BadRequestException(`Cannot approve company. Missing or unverified documents: ${missing}.`);
    }

    const now = new Date();
    const actorId = this.actorId(actor);
    const updated = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
          "onboarding.approvedAt": now,
          "onboarding.approvedBy": actorId,
          "onboarding.setupEmailSentAt": now,
          "onboarding.verificationSummary": {
            source: VERIFICATION_SOURCES.Manual,
            status: ONBOARDING_DOCUMENT_STATUS.Verified,
            checkedAt: now,
            checkedBy: actorId
          }
        },
        $push: {
          notes: {
            text: "Company paperwork approved. Waiting for payment/setup.",
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    await this.appendAudit(companyId, actor, "paperwork_approved", "Company paperwork approved.", {});
    await this.sendSetupEmail(updated as any);
    return updated;
  }

  async requestCorrection(companyId: string, data: RequestCorrectionDTO, actor: any) {
    const now = new Date();
    const actorId = this.actorId(actor);
    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.CorrectionNeeded,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.CorrectionNeeded,
          "onboarding.correctionRequestedAt": now,
          "onboarding.correctionRequestedBy": actorId
        },
        $push: {
          notes: {
            text: `Correction requested: ${data.message}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "correction_requested", data.message, {});
    await this.sendCorrectionEmail(company as any, data.message);
    return company;
  }

  async inactivateCompany(companyId: string, data: InactivateCompanyDTO, actor: any) {
    const now = new Date();
    const current = await this.companyModel.findById(companyId).lean();
    if (!current) {
      throw new NotFoundException("Company not found.");
    }

    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.Inactive,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.Inactive,
          "onboarding.previousStatus": current.status,
          deactivationReason: data.reason
        },
        $push: {
          notes: {
            text: `Company moved inactive: ${data.reason}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    await this.userModel.updateMany({ companyId }, { $set: { isActive: false } });
    await this.appendAudit(companyId, actor, "company_inactivated", data.reason, {});
    return company;
  }

  async restoreCompany(companyId: string, data: RestoreCompanyDTO, actor: any) {
    const now = new Date();
    const current = await this.companyModel.findById(companyId).lean();
    if (!current) {
      throw new NotFoundException("Company not found.");
    }
    const isBlockedUnlock = current.status === COMPANY_ONBOARDING_STATUSES.Blocked && data.status === COMPANY_ONBOARDING_STATUSES.Draft;
    const update: any = {
      $set: {
        status: data.status,
        "onboarding.status": data.status,
        deactivationReason: "",
        deletedAt: null,
        deletedBy: null
      },
      $push: {
        notes: {
          text: `Company restored to ${data.status}${data.reason ? `: ${data.reason}` : ""}`,
          type: "action",
          date: now
        }
      }
    };

    if (isBlockedUnlock) {
      update.$set["onboarding.unblockedAt"] = now;
      update.$set["onboarding.unblockedBy"] = this.actorId(actor);
      update.$set["onboarding.verificationOverride"] = true;
    }

    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      update,
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "company_restored", `Company restored to ${data.status}.`, { reason: data.reason ?? "" });
    return company;
  }

  async softDeleteCompany(companyId: string, data: SoftDeleteCompanyDTO, actor: any) {
    const now = new Date();
    const current = await this.companyModel.findById(companyId).lean();
    if (!current) {
      throw new NotFoundException("Company not found.");
    }

    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge,
          "onboarding.previousStatus": current.status,
          deletedAt: now,
          deletedBy: this.actorId(actor),
          deactivationReason: data.reason
        },
        $push: {
          notes: {
            text: `Company soft-deleted: ${data.reason}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    await this.userModel.updateMany({ companyId }, { $set: { isActive: false } });
    await this.appendAudit(companyId, actor, "company_soft_deleted", data.reason, {});
    return company;
  }

  async purgeCompany(companyId: string, actor: any) {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    if (company.status !== COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge) {
      throw new BadRequestException("Company must be soft-deleted before permanent deletion.");
    }

    await this.appendAudit(companyId, actor, "company_purged", "Company permanently deleted.", { companyName: company.name });
    await this.userModel.deleteMany({ companyId });
    await this.companyModel.findByIdAndDelete(companyId);
    fs.rmSync(`files/${companyId}`, { recursive: true, force: true });
    return { result: "OK" };
  }

  async resendSetupEmail(companyId: string, actor: any) {
    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.sendSetupEmail(company as any);
    await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: { "onboarding.setupEmailSentAt": new Date() },
        $push: {
          notes: {
            text: "Setup email resent.",
            type: "action",
            date: new Date()
          }
        }
      },
      { new: true }
    );
    await this.appendAudit(companyId, actor, "setup_email_resent", "Setup email resent.", {});
    return { result: "OK" };
  }

  private async appendAudit(companyId: string, actor: any, action: string, text: string, metadata: Record<string, unknown> = {}) {
    const entry = {
      mail: actor?.email ?? "system",
      operation: text,
      action,
      metadata,
      date: new Date()
    };
    await this.historyModel.findOneAndUpdate(
      { companyId: companyId.toString() },
      { $push: { history: entry } },
      { upsert: true, new: true }
    );
  }

  private buildDocumentPath(documentType: OnboardingDocumentType): string {
    if (documentType === "insurance") return "onboarding.documents.insurance";
    if (documentType === "hazmat") return "onboarding.documents.hazmat";
    return "onboarding.documents.mc";
  }

  private getDocumentDisplayName(documentType: OnboardingDocumentType): string {
    if (documentType === "insurance") return "Insurance certificate";
    if (documentType === "hazmat") return "HAZMAT authority";
    return "MC authority";
  }

  private actorId(actor: any): string {
    return actor?._id?.toString?.() ?? actor?.id ?? "system";
  }

  private async sendSetupEmail(company: any) {
    const appUrl = this.configService.get<string>("APP_URL") || "http://localhost:4300";
    const projectName = this.configService.get<string>("PROJECT_NAME") || "Prometheus";
    const recipients = [company?.email, company?.contactPerson?.email].filter(Boolean);
    const html = `Dear ${company?.contactPerson?.firstName ?? company?.name},<br><br>
Your company paperwork has been approved for ${projectName}. Please open ${appUrl} to complete payment and company setup.<br><br>
Best regards,<br>${projectName}`;
    await this.sendEmail(recipients, `${projectName}: Company Approved`, html);
  }

  private async sendCorrectionEmail(company: any, message: string) {
    const appUrl = this.configService.get<string>("APP_URL") || "http://localhost:4300";
    const projectName = this.configService.get<string>("PROJECT_NAME") || "Prometheus";
    const recipients = [company?.email, company?.contactPerson?.email].filter(Boolean);
    const html = `Dear ${company?.contactPerson?.firstName ?? company?.name},<br><br>
Your ${projectName} onboarding needs a correction:<br><br>
${message}<br><br>
Open ${appUrl} to update the paperwork.<br><br>
Best regards,<br>${projectName}`;
    await this.sendEmail(recipients, `${projectName}: Onboarding Correction Needed`, html);
  }

  private async sendEmail(targetEmail: string[], emailSubject: string, htmlContent: string) {
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>("MAIL_HOST"),
      port: +this.configService.get<string>("MAIL_PORT"),
      pool: true,
      secure: !!+this.configService.get<string>("MAIL_PORT_SECURE"),
      auth: {
        user: this.configService.get<string>("MAIL_USER"),
        pass: this.configService.get<string>("MAIL_PASSWORD")
      },
      tls: { rejectUnauthorized: false }
    });

    try {
      await transporter.sendMail({
        from: `${this.configService.get<string>("PROJECT_NAME")} <${this.configService.get<string>("MAIL_USER")}>`,
        to: targetEmail,
        subject: emailSubject,
        html: htmlContent
      });
    } catch (error) {
      console.log("Onboarding email not sent: ", targetEmail, error);
    }
  }
}
