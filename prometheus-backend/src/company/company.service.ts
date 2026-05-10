import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { plainToClass } from "class-transformer";
import * as fs from "fs";
import * as mammoth from "mammoth";
import { Model } from "mongoose";
import { InjectStripe } from "nestjs-stripe";
import * as nodemailer from "nodemailer";
import { CountersInterface } from "src/counters/interface/counters.interface";
import { AppGateway } from "src/gateway/app.gateway";
import { User } from "src/user/interface/user.interface";
import Stripe from "stripe";
import { CreateCompanyDTO } from "./dto/create-company.dto";
import { ResponseHistoryDTO } from "./dto/history.dto";
import { ResponseCompanyDTO } from "./dto/response.company.dto";
import { UpdateCompanyDTO } from "./dto/update-company.dto";
import { CompanyAuthorityValidationService } from "./authority/company-authority-validation.service";
import { Company } from "./interface/company.interface";
import { History } from "./interface/history.interface";
import {
  COMPANY_ONBOARDING_STATUSES,
  ONBOARDING_DOCUMENT_STATUS,
  VERIFICATION_SOURCES
} from "./onboarding/onboarding.constants";
import { getQueueStatuses, normalizeCompanyStatus } from "./onboarding/onboarding.utils";
@Injectable()
export class CompanyService {
  constructor(
    @InjectModel("Company") private readonly CompanyModel: Model<Company>,
    @InjectModel("User") private readonly UserModel: Model<User>,
    @InjectModel("History") private readonly HistoryModel: Model<History>,
    @InjectModel("Counters") private readonly CountersModel: Model<CountersInterface>,
    @InjectStripe() private readonly stripeClient: Stripe,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authorityValidationService: CompanyAuthorityValidationService,
    private gateway: AppGateway
  ) {}

  async sendExpirationReminder() {
    let today = new Date();
    let expiredDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    await this.CompanyModel.updateMany({ "filesNames.mc.expDate": { $lte: today } }, { "filesNames.mc.expDate": null });
    await this.CompanyModel.updateMany({ "filesNames.insurance.expDate": { $lte: today } }, { "filesNames.insurance.expDate": null });
    await this.CompanyModel.updateMany({ "filesNames.hazmat.expDate": { $lte: today }, "type": {$ne:'broker'} }, { "filesNames.hazmat.expDate": null });
    const companiesToRemind = await this.CompanyModel.find({
      $or: [
        { "filesNames.mc.expDate": { $lte: expiredDate } },
        { "filesNames.hazmat.expDate": { $lte: expiredDate }, "type": {$ne:'broker'}  },
        { "filesNames.insurance.expDate": { $lte: expiredDate } }
      ]
    });
    await companiesToRemind.map(async (company) => {
      let user = await this.UserModel.find({ _id: company.adminId });
      this.sendExpdates(user[0]);
    });
  }

  async checkAndUpdateStatus() {
    const companiesToUpdate = await this.CompanyModel.updateMany({
      $or: [{ "filesNames.mc.expDate": null }, { "filesNames.hazmat.expDate": null, "type": {$ne:'broker'} }, { "filesNames.insurance.expDate": null }],
      $and: [
        {
          status: {
            $nin: [
              "pending",
              COMPANY_ONBOARDING_STATUSES.PendingReview,
              COMPANY_ONBOARDING_STATUSES.CorrectionNeeded,
              "unpaid",
              COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
              COMPANY_ONBOARDING_STATUSES.Draft,
              COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge
            ]
          }
        },
        { isWaiting: false }
      ]
    },
    {
      status: COMPANY_ONBOARDING_STATUSES.Inactive,
      "onboarding.status": COMPANY_ONBOARDING_STATUSES.Inactive,
      deactivationReason:'Company deactivated due to expired licenses'
    }
    );
  }

  async create(data: CreateCompanyDTO): Promise<ResponseCompanyDTO> {
    try {
      const email = data.email?.toLowerCase();
      const existingBlocked = await this.CompanyModel.findOne({ email, status: COMPANY_ONBOARDING_STATUSES.Blocked });
      const blockingReasons = await this.getCompanyCreateBlockingReasons(data);

      if (blockingReasons.length) {
        const existingOperationalEmail = email
          ? await this.CompanyModel.findOne({
              email,
              status: {
                $nin: [
                  COMPANY_ONBOARDING_STATUSES.Draft,
                  COMPANY_ONBOARDING_STATUSES.Blocked
                ]
              }
            }).lean()
          : null;

        if (existingOperationalEmail) {
          throw new BadRequestException({
            message: "Prometheus could not continue onboarding because this company information needs review.",
            reasons: blockingReasons,
            status: COMPANY_ONBOARDING_STATUSES.Blocked
          });
        }
        await this.blockCompanyRequest(data, blockingReasons, existingBlocked);
      }

      let findMatchMail = await this.CompanyModel.find({ email, status: COMPANY_ONBOARDING_STATUSES.Draft });
      if (findMatchMail.length !== 0) {
        await this.CompanyModel.deleteOne({ _id: findMatchMail[0]._id });
        await this.UserModel.deleteOne({ companyId: findMatchMail[0]._id, role: { $ne: "superadmin" } });
      }
      const clientId = await this.nextClientId();
      const requestedSeats = Math.max(1, Number(data.requestedSeats ?? 1) || 1);
      let dbCompany: any = await this.CompanyModel.create({
        ...data,
        status: COMPANY_ONBOARDING_STATUSES.Draft,
        isWaiting: false,
        clientId: clientId,
        onboarding: {
          status: COMPANY_ONBOARDING_STATUSES.Draft,
          requestedSeats
        }
      });
      const token = this.jwtService.sign({ companyId: dbCompany._id });
      dbCompany.key = token;
      await this.HistoryModel.create({ companyId: dbCompany._id, history: [] });
      
      return this.toCompanyResponse(dbCompany);
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      console.log(err);
      throw new BadRequestException();
    }
  }

  async addAdminActivity(companyId, userMail, operation) {
    try {

      companyId = companyId.toString()
      let date = new Date();
      let newActivity = { mail: userMail, operation, date };
      await this.HistoryModel.findOneAndUpdate({ companyId }, { $push: { history: newActivity } });
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException();
    }
  }

  async update(id: string, data: UpdateCompanyDTO): Promise<ResponseCompanyDTO> {
    try {
      const updateData: any = { ...data };
      if (data.requestedSeats) {
        updateData["onboarding.requestedSeats"] = data.requestedSeats;
        delete updateData.requestedSeats;
      }
      if (data.filesNames) {
        Object.assign(updateData, this.buildDocumentUploadUpdate(data.filesNames));
      }
      let dbCompany: any = await this.CompanyModel.findOneAndUpdate(
        { _id: id, status: { $in: [COMPANY_ONBOARDING_STATUSES.Draft, COMPANY_ONBOARDING_STATUSES.CorrectionNeeded] } },
        updateData,
        { new: true }
      );
      return this.toCompanyResponse(dbCompany);
    } catch (err) {
      console.log(err);
      throw new BadRequestException();
    }
  }

  async updateBySupervisor(id: string, data: UpdateCompanyDTO): Promise<ResponseCompanyDTO> {
    try {
      let dbCompany: any = await this.CompanyModel.findOneAndUpdate({ _id: id }, data,{new:true});
      return this.toCompanyResponse(dbCompany);
    } catch (err) {
      console.log(err);
      throw new BadRequestException();
    }
  }

  async renew(id: string, type: string, ext: string, userEmail: string): Promise<ResponseCompanyDTO> {
    try {
      let update;
      switch (type) {
        case "HAZMAT-Authority":
          update = { "filesNames.hazmat.ext": ext, "filesNames.hazmat.expDate": null };
          break;
        case "Insurance-Certificate":
          update = { "filesNames.insurance.ext": ext, "filesNames.insurance.expDate": null };
          break;
        case "MC-Authority":
          update = { "filesNames.mc.ext": ext, "filesNames.mc.expDate": null };
          break;
      }

      update["$push"] = { notes: { text: `Company Admin renewed ${type}`, type: "system", date: new Date() } };
      update.isWaiting = true;
      update["$push"]["notes"] = {
        text: `Company Admin renewed ${type}`,
        type: "action",
        date: new Date().toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
      };

    this.addAdminActivity(id,userEmail,`Company Admin renewed ${type}`)

      let renew: any = await this.CompanyModel.findOneAndUpdate({ _id: id }, update, {
        new: true
      });

      return this.toCompanyResponse(renew);
    } catch (err) {
      console.log(err);
      throw new BadRequestException();
    }
  }

  async getAllCompanies(): Promise<ResponseCompanyDTO> {
    try {
      let allCompanies: any = await this.CompanyModel.find().sort({ createdAt: -1 }).exec();

      return this.toCompanyResponse(allCompanies);
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException();
    }
  }

  async getCompanyById(id): Promise<ResponseCompanyDTO> {
    try {
      let company: any = await this.CompanyModel.findById(id.toString());
      const activeUsersCount = await this.UserModel.countDocuments({ companyId: id.toString(), isActive: true, role: {$ne: 'supervisor'} });
      const companyWithActiveUsers = {
        ...company.toObject(),
        activeUsers: activeUsersCount
      };
      return this.toCompanyResponse(companyWithActiveUsers);
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException();
    }
  }

  async getHistory(id): Promise<ResponseHistoryDTO> {
    try {
      let company: any = await this.HistoryModel.find({ companyId: id.toString() });
      company[0].history = company[0].history.reverse();
      return plainToClass(ResponseHistoryDTO, company[0]);
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException();
    }
  }

  async getCompanyByIdSupervisor(id): Promise<ResponseCompanyDTO> {
    try {
      let company: any = await this.CompanyModel.findById(id.toString());
      return this.toCompanyResponse(company);
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException();
    }
  }

  async get(id): Promise<Company> {
    try {
      return await this.CompanyModel.findById(id);
    } catch (err) {
      console.log(err);
      throw new NotFoundException();
    }
  }

  async updateDecreasedUsers(companyId): Promise<Company> {
    try {
      const company = await this.CompanyModel.findOneAndUpdate(
        { _id: companyId },
        {
          "subscription.decreasedUsers": false
        }
      );
      return company;
    } catch (err) {
      console.log(err);

      throw new NotFoundException();
    }
  }
  async failedSubscription(customerId:string){
    await this.CompanyModel.findOneAndUpdate(
      { "subscription.customer": customerId },
      {
        status: COMPANY_ONBOARDING_STATUSES.Inactive,
        "onboarding.status": COMPANY_ONBOARDING_STATUSES.Inactive,
        deactivationReason: "Subscription payment failed"
      }
    );
  }

  async setSubscriptionCustomer(companyId: string, customerId: string): Promise<Company> {
    return this.CompanyModel.findOneAndUpdate(
      { _id: companyId },
      { "subscription.customer": customerId },
      { new: true }
    );
  }

  async updateSubscription(customerId: string, endPeriod: number, quantity: number, amount_due: number): Promise<Company> {
    try {
      let today = new Date();
      let oldCompany = await this.CompanyModel.find({ "subscription.customer": customerId });
      if (!oldCompany.length) {
        throw new NotFoundException();
      }
      let decreasedUsers = null;
      const previousQuantity = oldCompany[0].subscription?.quantity ?? 0;
      if (quantity !== null && quantity < previousQuantity) {
        decreasedUsers = true;
      }
      const nextStatus = endPeriod ? COMPANY_ONBOARDING_STATUSES.Active : COMPANY_ONBOARDING_STATUSES.Inactive;
      const company = await this.CompanyModel.findOneAndUpdate(
        { "subscription.customer": customerId },
        {
          status: nextStatus,
          "onboarding.status": nextStatus,
          "subscription.lastPayment": today,
          "subscription.endPeriod": endPeriod,
          "subscription.quantity": quantity,
          "subscription.amount_due": amount_due,
          "subscription.decreasedUsers": decreasedUsers,
          deactivationReason: endPeriod ? "" : "Subscription inactive"
        },
        { new: true }
      );
      // let count = await this.UserModel.countDocuments({ companyId: company._id, role: { $ne: "admin" } });
      let count = await this.UserModel.countDocuments({ companyId: company._id});
      if (quantity !== null && count > quantity) {
        await this.UserModel.updateMany({ companyId: company._id, role: { $nin: ["admin", "supervisor", "superadmin"] } }, { $set: { isActive: false } });
      }
      return company;
    } catch (err) {
      console.log(err);

      throw new NotFoundException();
    }
  }

  async changeCompanyStatus(id: string, status: string): Promise<ResponseCompanyDTO> {
    try {
      let company: Company = await this.CompanyModel.findById(id);
      const nextStatus = this.toCanonicalStatusForWrite(status);
      if (status == "unpaid" && !company.subscription?.customer) {
        await this.HistoryModel.create({ companyId: id, history: [] });
        try {
          const client = await this.stripeClient.customers.create({
            name: company.name,
            email: company.email,
            phone: company.phone,
            metadata: { Id: company._id.toString() }
          });
          company.subscription = { ...(company.subscription ?? {}), customer: client.id };
        } catch (error) {
          console.log("Stripe customer was not created during status change.", error);
        }
      }

      if (nextStatus === COMPANY_ONBOARDING_STATUSES.PendingReview) {
        let supervisors = await this.UserModel.find({ role: "supervisor" });
        let mails = supervisors.map((x) => x.email);
        this.sendMailToSupervisors(mails);
      }

      let note;
      if (normalizeCompanyStatus(company.status) === COMPANY_ONBOARDING_STATUSES.Active && nextStatus === COMPANY_ONBOARDING_STATUSES.Inactive) {
        note = {
          text: `Company status changed to inactive`,
          name: "Company",
          lastName: "Admin",
          type: "action",
          date: new Date()
        };
        await this.CompanyModel.findOneAndUpdate({_id:id},{deactivationReason:'Deactivated by Admin'});
      } else if (normalizeCompanyStatus(company.status) === COMPANY_ONBOARDING_STATUSES.Inactive && nextStatus === COMPANY_ONBOARDING_STATUSES.Active) {
        note = {
          text: `Company status changed to active`,
          name: "Company",
          lastName: "Admin",
          type: "action",
          date: new Date()
        };
      } else {
        note = {
          text: `Company status changed from ${company.status} to ${nextStatus}`,
          name: "Company",
          lastName: "Admin",
          type: "action",
          date: new Date()
        };
      }

      const update: any = {
        $push: { notes: note },
        status: nextStatus,
        "onboarding.status": nextStatus
      };
      if (nextStatus === COMPANY_ONBOARDING_STATUSES.PendingReview) {
        update["onboarding.submittedAt"] = new Date();
      }
      if (company.subscription?.customer) {
        update.subscription = company.subscription;
      }

      const updatedCompany = await this.CompanyModel.findOneAndUpdate({ _id: id }, update, { new: true });

      return this.toCompanyResponse(updatedCompany);
    } catch (err) {
      console.log(err);
      throw new NotFoundException();
    }
  }

  async manageWaiting(id: string, isWaiting: boolean, firstName: string, lastName: string): Promise<ResponseCompanyDTO> {
    const supervisorName = `${firstName} ${lastName}`;

    try {
      const updateData = { isWaiting };
      let note;

      if (!isWaiting) {
        note = {
          text: `${supervisorName} - changed the company status to Not Waiting`,
          name: "Admin",
          lastName: "Action",
          type: "action",
          date: new Date()
        };
      } else {
        note = {
          text: `${supervisorName} - changed the company status to Waiting`,
          name: "Admin",
          lastName: "Action",
          type: "action",
          date: new Date()
        };
      }
      updateData["$push"] = { notes: note };

      let company: any = await this.CompanyModel.findOneAndUpdate({ _id: id }, updateData, {
        new: true
      });

      return this.toCompanyResponse(company);
    } catch (err) {
      console.log(err);
      throw new NotFoundException();
    }
  }
  async addNote(text, companyId, name, lastName) {
    let noteData = { text: text.text, name, lastName, date: new Date(), type: "note" };
    const room: string = companyId + "_carrier";
    let check = await this.CompanyModel.findOneAndUpdate(
      { _id: companyId },
      { $push: { notes: { text: text.text, name, lastName, type: "note" } } },
      {
        new: true
      }
    );
    //this.gateway.broadcastForMessage(room, { type: "new", data: messageData })
    return noteData;
  }

  async changeFileExpDate(data, companyId,user) {
    data.data.expDate = new Date(data.data.expDate);
    let update;

    switch (data.data.name) {
      case "HAZMAT-Authority":
        update = { "filesNames.hazmat.expDate": data.data.expDate, "filesNames.hazmat.dateStatus": "pending" };
        break;
      case "Insurance-Certificate":
        update = { "filesNames.insurance.expDate": data.data.expDate, "filesNames.insurance.dateStatus": "pending" };
        break;
      case "MC-Authority":
        update = { "filesNames.mc.expDate": data.data.expDate, "filesNames.mc.dateStatus": "pending" };
        break;
    }
    update["$push"] = {notes : {
      text: `${user.firstName} ${user.lastName} changed the date for ${data.data.name} to ${new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      })}`,
      type: "action",
      date: new Date().toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    }};
    let check = await this.CompanyModel.findOneAndUpdate({ _id: companyId }, update, {
      new: true
    });
    //this.gateway.broadcastForMessage(room, { type: "new", data: messageData })
    return check;
  }

  async getCompaniesByStatus(type: any): Promise<ResponseCompanyDTO> {
    try {
      const queueGroup = ["pending", "waitingSetup", "active", "inactive"].includes(type) ? getQueueStatuses(type) : [type];
      let companies: any = await this.CompanyModel.find({ status: { $in: queueGroup } }).sort({ isWaiting: -1,createdAt: -1  });
      return this.toCompanyResponse(companies);
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException();
    }
  }

  async search(text: any): Promise<ResponseCompanyDTO> {
    try {
      let search = { name: { $regex: text.text, $options: "i" } };
      let companies: any = await this.CompanyModel.find(search).sort({ createdAt: -1 });
      return this.toCompanyResponse(companies);
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException();
    }
  }

  async deleteCompanyById(id) {
    try {
      await this.CompanyModel.findByIdAndDelete(id);
      await this.UserModel.findOneAndDelete({ companyId: id });
      fs.rmSync(`files/${id}`, { recursive: true, force: true });
    } catch (err) {
      throw new NotFoundException();
    }
  }

  private async getCompanyCreateBlockingReasons(data: CreateCompanyDTO): Promise<string[]> {
    const reasons = await this.authorityValidationService.getBlockingReasons(data);
    const email = data.email?.toLowerCase();
    const dot = this.cleanNumber(data.dot);
    const mc = this.cleanNumber(data.mc);

    if (email) {
      const existingEmail = await this.CompanyModel.findOne({
        email,
        status: { $nin: [COMPANY_ONBOARDING_STATUSES.Draft, COMPANY_ONBOARDING_STATUSES.Blocked] }
      }).lean();
      if (existingEmail) {
        reasons.push(`Company email ${email} is already connected to an existing Prometheus company.`);
      }
    }

    if (dot) {
      const existingDot = await this.CompanyModel.findOne({
        dot: data.dot,
        status: { $nin: [COMPANY_ONBOARDING_STATUSES.Draft, COMPANY_ONBOARDING_STATUSES.Blocked, COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge] }
      }).lean();
      if (existingDot && this.cleanNumber((existingDot as any).mc) !== mc) {
        reasons.push(`DOT ${data.dot} is already connected to MC ${(existingDot as any).mc || "unknown"} in Prometheus.`);
      }
    }

    if (mc) {
      const existingMc = await this.CompanyModel.findOne({
        mc: data.mc,
        status: { $nin: [COMPANY_ONBOARDING_STATUSES.Draft, COMPANY_ONBOARDING_STATUSES.Blocked, COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge] }
      }).lean();
      if (existingMc && this.cleanNumber((existingMc as any).dot) !== dot) {
        reasons.push(`MC ${data.mc} is already connected to DOT ${(existingMc as any).dot || "unknown"} in Prometheus.`);
      }
    }

    return Array.from(new Set(reasons));
  }

  private async blockCompanyRequest(data: CreateCompanyDTO, reasons: string[], existingBlocked: any): Promise<never> {
    const now = new Date();
    const requestedSeats = Math.max(1, Number(data.requestedSeats ?? 1) || 1);
    const update = {
      ...data,
      email: data.email?.toLowerCase(),
      status: COMPANY_ONBOARDING_STATUSES.Blocked,
      isWaiting: false,
      statusReason: reasons.join(" "),
      deactivationReason: reasons.join(" "),
      onboarding: {
        status: COMPANY_ONBOARDING_STATUSES.Blocked,
        requestedSeats,
        blockedAt: now,
        blockedReasons: reasons,
        blockedSource: "fmcsa_datahub",
        verificationOverride: false
      }
    };

    let company = existingBlocked;
    if (company) {
      company = await this.CompanyModel.findOneAndUpdate({ _id: company._id }, update, { new: true });
    } else {
      company = await this.CompanyModel.create({
        ...update,
        clientId: await this.nextClientId()
      });
      await this.HistoryModel.create({ companyId: company._id, history: [] });
    }

    const key = this.jwtService.sign({ companyId: company._id });
    await this.HistoryModel.findOneAndUpdate(
      { companyId: company._id.toString() },
      {
        $push: {
          history: {
            mail: data.email?.toLowerCase() ?? "system",
            operation: `Company blocked during signup: ${reasons.join(" | ")}`,
            action: "company_signup_blocked",
            metadata: { reasons },
            date: now
          }
        }
      },
      { upsert: true }
    );

    throw new BadRequestException({
      message: "Prometheus could not continue onboarding because the authority information needs master review.",
      reasons,
      companyId: company._id.toString(),
      key,
      status: COMPANY_ONBOARDING_STATUSES.Blocked
    });
  }

  private async nextClientId(): Promise<string> {
    const checkCompanyCounter = await this.CountersModel.find();
    if (checkCompanyCounter.length === 0) {
      await this.CountersModel.create({ companyCounter: 0 });
    }
    const clientId: any = await this.CountersModel.findOneAndUpdate({}, { $inc: { companyCounter: 1 } }, { new: true });
    return String(clientId.companyCounter).padStart(4, "0");
  }

  private cleanNumber(value: unknown): string {
    return String(value ?? "").replace(/\D/g, "");
  }

  private toCompanyResponse(data: any): any {
    return plainToClass(ResponseCompanyDTO, this.toPlainCompany(data));
  }

  private toPlainCompany(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.toPlainCompany(item));
    }

    if (data && typeof data.toObject === "function") {
      const plain = data.toObject();
      if (data.key) {
        plain.key = data.key;
      }
      return plain;
    }

    return data;
  }

  private async sendEmail(targetEmail: string[], emailSubject: string, htmlContent: string) {
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>("MAIL_HOST"),
      port: +this.configService.get<string>("MAIL_PORT"),
      pool: true,
      secure: !!+this.configService.get<string>("MAIL_PORT_SECURE"), // true for gmail_port, false for other ports
      auth: {
        user: this.configService.get<string>("MAIL_USER"), // generated ethereal user
        pass: this.configService.get<string>("MAIL_PASSWORD") // generated ethereal password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    try {
      await transporter.sendMail({
        from: `${this.configService.get<string>("PROJECT_NAME")} <${this.configService.get<string>("MAIL_USER")}>`,
        to: targetEmail, // list of receivers
        subject: emailSubject, // Subject line
        html: htmlContent // html body
      });
    } catch (err) {
      console.log(err);
      console.log("Email not sent: ", targetEmail);
      // throw new InternalServerErrorException();
    }
  }
  async sendMailToSupervisors(mails) {
    const appUrl = this.configService.get<string>("APP_URL") || "http://localhost:4300";
    const projectName = this.configService.get<string>("PROJECT_NAME") || "Prometheus";
    const html = `New company waiting for approval! <a href="${appUrl}">Click here!</a>`;
    this.sendEmail(mails, `${projectName}: New Company `, html);
  }
  async sendActivationMail(data) {
    const appUrl = this.configService.get<string>("APP_URL") || "http://localhost:4300";
    const projectName = this.configService.get<string>("PROJECT_NAME") || "Prometheus";
    const html = `Dear ${data.name},<br><br>
 
    I am delighted to inform you that your company has been approved to join ${projectName}. We have carefully reviewed your application
      and trust that your company's expertise and commitment to safety and compliance will be a valuable addition to the platform.<br><br>
   
We believe that your company's insights
       and contributions will be highly valued by the community, and we look forward
        to working with you.<br><br>
   
    Please feel free to contact us if you have any questions or require
     further information about the platform. Once again, congratulations on
      your approval, and we look forward to a successful partnership.<br><br>
   

      <a href="${appUrl}">Open ${projectName}</a><br><br>


    Best regards,<br>
   
    ${projectName}`;
    this.sendEmail([data.email, data.adminEmail], `${projectName}: Approved`, html);
  }

  async sendExpdates(data) {
    const appUrl = this.configService.get<string>("APP_URL") || "http://localhost:4300";
    const projectName = this.configService.get<string>("PROJECT_NAME") || "Prometheus";
    const supportEmail = this.configService.get<string>("SUPPORT_EMAIL") || "support@prometheus.local";
    const html = `  <p>Dear ${data.firstName} ${data.lastName},</p>
    <p>
    I hope this email finds you well. We wanted to take a moment to remind you about the upcoming expiration of your company's documents.
    According to our records, your documents are set to expire on one of your certificates. It's essential to keep your documents up to date to ensure
    smooth operations and compliance with safety regulations.
     

  </p>
  <p>
    As a friendly reminder, please make sure to renew your documents before the expiration date. ${projectName} is committed to promoting safety
    and compliance in hazardous items transportation, and we value your participation in achieving this goal.
  </p>
  <p>
    If you have any questions or need assistance with the renewal process, feel free to reach out to our support team at ${supportEmail}.
    We are here to help you with any inquiries you may have.
  </p>
  <p>
    Thank you for being part of ${projectName} and contributing to our mission of ensuring safe and responsible hazardous items transportation.
  </p>
  <p>Update your files from <a href="${appUrl}">${appUrl}</a>!</p>
  <p>Best regards,</p>
  <p>${projectName}</p>`;
    this.sendEmail([data.email], `${projectName}: Document Expiration Reminder`, html);
  }

  async getDocPreview(filePath: string): Promise<any> {
    try {
      const res = await mammoth.convertToHtml({ path: `${filePath}` });
      return res.value;
    } catch (err) {
      throw err;
    }
  }

  private toCanonicalStatusForWrite(status: string): string {
    if (status === "pending") return COMPANY_ONBOARDING_STATUSES.PendingReview;
    if (status === "unpaid") return COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup;
    if (status === "activated") return COMPANY_ONBOARDING_STATUSES.Active;
    if (status === "deactivated") return COMPANY_ONBOARDING_STATUSES.Inactive;
    return normalizeCompanyStatus(status);
  }

  private buildDocumentUploadUpdate(filesNames: Object): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    Object.entries(filesNames ?? {}).forEach(([key, value]: [string, any]) => {
      const documentType = this.mapUploadedFileType(key);
      if (!documentType) return;
      updates[`onboarding.documents.${documentType}.fileType`] = documentType;
      updates[`onboarding.documents.${documentType}.displayName`] = value?.name ?? key;
      updates[`onboarding.documents.${documentType}.ext`] = value?.ext ?? "";
      updates[`onboarding.documents.${documentType}.source`] = VERIFICATION_SOURCES.Manual;
      updates[`onboarding.documents.${documentType}.status`] = ONBOARDING_DOCUMENT_STATUS.Pending;
    });
    return updates;
  }

  private mapUploadedFileType(fileType: string): "mc" | "insurance" | "hazmat" | null {
    if (fileType === "MC-Authority" || fileType === "mc") return "mc";
    if (fileType === "Insurance-Certificate" || fileType === "insurance") return "insurance";
    if (fileType === "HAZMAT-Authority" || fileType === "hazmat") return "hazmat";
    return null;
  }
}
