import { ForbiddenException, Injectable, NotAcceptableException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { Model } from "mongoose";
import * as bcrypt from "bcrypt";

import { RequestLogInDTO } from "./dto/request-login.dto";
import { User } from "../user/interface/user.interface";
import { Messages } from "../shared/messages/messages.model";

import * as crypto from "crypto"
import { Company } from "../company/interface/company.interface";
import { isCompanyOperational } from "../company/onboarding/onboarding.utils";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel("User") private readonly UserModel: Model<User>,
    @InjectModel("Company") private readonly CompanyModel: Model<Company>,
    private readonly jwtService: JwtService
  ) { }

  async checkLogin(login: RequestLogInDTO, req): Promise<any> {
    const user = await this.UserModel.findOne({ email: login.email });
    if (user) {
      if (!user.password) {
        throw new ForbiddenException(Messages.SetPassword);
      } else if (!user.isActive) {
        throw new NotAcceptableException(Messages.BlockedAccount);
      } else {
        const isAuthenticated: boolean = await bcrypt.compare(login.password, user.password);
        if (!isAuthenticated) {
          throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
        }
        if (user.role !== 'superadmin' && user.role !== 'admin' && user.role !== 'supervisor' && user.role !== 'batch') {
          let company = await this.CompanyModel.findById(user.companyId);
          if (!company || !isCompanyOperational(company.status)) {
            throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
          }
          if (company.subscription?.endPeriod) {
            let endPeriod = new Date(company.subscription.endPeriod);
            let today = new Date();
            if (today.getTime() > endPeriod.getTime()) {
              throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
            }
          }
        }
        if (user.isLogged === '' || user.isLogged === null || user.isLogged === undefined) {
          return true
        } else {
          return false;
        }
      }
    } else {
      throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
    }
  }

  async signOut(req): Promise<any> {
    const user = await this.UserModel.findOneAndUpdate({ email: req.user.email }, { isLogged: '' });

  }
  async sessionClear(user): Promise<any> {
    await this.UserModel.findOneAndUpdate({ _id: user.id }, { isLogged: '' });

  }
  async login(login: RequestLogInDTO): Promise<{ token: string }> {
    var crypto = require("crypto");
    var id = crypto.randomBytes(20).toString('hex');
    const user = await this.UserModel.findOne({ email: login.email });
    if (user) {
      if (!user.password) {
        throw new ForbiddenException(Messages.SetPassword);
      } else if (!user.isActive) {
        throw new NotAcceptableException(Messages.BlockedAccount);
      } else {
        const isAuthenticated: boolean = await bcrypt.compare(login.password, user.password);
        if (isAuthenticated) {
          if (user.role !== 'superadmin' && user.role !== 'admin' && user.role !== 'supervisor' && user.role !== 'batch') {
            let company = await this.CompanyModel.findById(user.companyId);
            if (!company || !isCompanyOperational(company.status)) {
              throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
            }
            if (company.subscription?.endPeriod) {
              let endPeriod = new Date(company.subscription.endPeriod);
              let today = new Date();
              if (today.getTime() > endPeriod.getTime()) {
                throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
              }
            }
          }
          await this.UserModel.findOneAndUpdate({ email: login.email }, { isLogged: id })
          const token = await this.jwtService.sign({
            id: user._id,
            role: user.lastLoggedInRole ? user.lastLoggedInRole : user.role,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            companyId: user.companyId,
            isLogged: id
          });
          return { token };
        } else {
          throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
        }
      }
    } else {
      throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
    }
  }

  async switchRole(userId: string, newRole: string): Promise<{ token: string }> {
    const user = await this.UserModel.findById(userId);
    if (!user || user.role !== 'admin') {
      throw new UnauthorizedException(Messages.AdminUserGuard);
    }

    const token = this.jwtService.sign({
      id: user._id,
      role: newRole,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyId: user.companyId,
      isLogged: user.isLogged
    });

    user.lastLoggedInRole = newRole;
    await user.save();

    return { token };

  }


  async setCompanyIdInToken(data) {

    //await this.UserModel.findOne({ _id: data.supervisorId });
    const user = await this.UserModel.findOneAndUpdate({ _id: data.supervisorId }, { companyId: data.companyId }, {
      new: true
    });
    let update = { $push: {} };
    update["$push"]["notes"] = {
      text: `${user.firstName}  ${user.lastName} logged in company as Admin.`,
      type: "action",
      date: new Date().toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    };
    await this.CompanyModel.findOneAndUpdate({ _id: data.companyId }, update, {
      new: true
    });
    if (user) {


      const token = this.jwtService.sign({
        id: user._id,
        role: user.role,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyId: data.companyId,
        isLogged: user.isLogged

      });
      return { token };

    }
  }
  async clearCompanyId(supervisorId) {
    //await this.UserModel.findOne({ _id: data.supervisorId });
    const user = await this.UserModel.findOneAndUpdate({ _id: supervisorId.id }, { companyId: null }, {
      new: true
    });

    if (user) {



      const token = this.jwtService.sign({
        id: user._id,
        role: user.role,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyId: null,
        isLogged: user.isLogged

      });
      return { token };

    }
  }
  async loginBatch(login: RequestLogInDTO, signature: string): Promise<{ token: string }> {





    let decrypted = this.decodeSignature(signature)
    if (decrypted !== "I'm a batch user." || login.email !== "batch" || login.password !== "batch") {
      throw new UnauthorizedException(Messages.IncorrectNickNameOrPassword);
    }




    const user = await this.UserModel.findOne({ role: "admin" });
    if (user) {
      const token = this.jwtService.sign({
        id: user._id,
        role: user.role,
        name: user.firstName,
        lastName: user.lastName,
        companyId: user.companyId
      });

      return { token };
    } else {
      throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
    }
  }

  private decodeSignature(key) {

    let encrypted = key.slice(16)
    let IV = key.slice(0, 16)
    let decipher = crypto.createDecipheriv('aes-256-cbc', process.env.SIGNATURE_KEY, IV);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    return (decrypted + decipher.final('utf8'));

  }
}
