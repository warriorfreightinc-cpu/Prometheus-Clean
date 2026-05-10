import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "src/user/interface/user.interface";
import { Company } from "../interface/company.interface";
import { COMPANY_ONBOARDING_STATUSES } from "../onboarding/onboarding.constants";
import { isCompanyInSetup, normalizeCompanyStatus } from "../onboarding/onboarding.utils";
import { CompanySetupStatusDTO, LocalActivateCompanyDTO } from "./dto/company-setup.dto";

@Injectable()
export class CompanySetupService {
  constructor(
    @InjectModel("Company") private readonly companyModel: Model<Company>,
    @InjectModel("User") private readonly userModel: Model<User>,
    private readonly configService: ConfigService
  ) {}

  async getStatus(companyId: string): Promise<CompanySetupStatusDTO> {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    return this.buildStatus(companyId, company);
  }

  async localActivate(companyId: string, data: LocalActivateCompanyDTO): Promise<CompanySetupStatusDTO> {
    const quantity = Number(data.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException("Seat quantity must be at least 1.");
    }

    if (!this.canUseLocalActivation()) {
      throw new ForbiddenException("Local setup activation is disabled. Use Stripe checkout.");
    }

    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    if (!isCompanyInSetup(company.status)) {
      throw new BadRequestException("Company must be approved and waiting setup before local activation.");
    }

    const now = new Date();
    const endPeriod = new Date(now);
    endPeriod.setMonth(endPeriod.getMonth() + 1);

    const updatedCompany = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        status: COMPANY_ONBOARDING_STATUSES.Active,
        "onboarding.status": COMPANY_ONBOARDING_STATUSES.Active,
        "subscription.customer": company.subscription?.customer ?? `local-setup-${companyId}`,
        "subscription.quantity": quantity,
        "subscription.amount_due": 0,
        "subscription.lastPayment": now,
        "subscription.endPeriod": endPeriod,
        "subscription.status": "local_active",
        deactivationReason: "",
        $push: {
          notes: {
            text: `Company activated locally with ${quantity} paid seats.`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    return this.buildStatus(companyId, updatedCompany);
  }

  private canUseLocalActivation(): boolean {
    const explicit = this.configService.get<string>("ALLOW_LOCAL_SETUP_ACTIVATION") === "true";
    const stripeKey = this.configService.get<string>("STRIPE_API_KEY") ?? "";
    return explicit || stripeKey.includes("placeholder") || stripeKey.startsWith("sk_test_local");
  }

  private async buildStatus(companyId: string, company: any): Promise<CompanySetupStatusDTO> {
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const companyData = typeof company.toObject === "function" ? company.toObject() : company;
    const activeUsers = await this.userModel.countDocuments({
      companyId,
      isActive: true,
      subscriptionEmail: true,
      role: { $nin: ["admin", "supervisor"] }
    });

    return {
      status: normalizeCompanyStatus(companyData.status),
      requestedSeats: Number(companyData.onboarding?.requestedSeats ?? companyData.subscription?.quantity ?? 1),
      paidSeats: Number(companyData.subscription?.quantity ?? 0),
      activeUsers,
      canLocalActivate: this.canUseLocalActivation(),
      company: companyData
    };
  }
}
