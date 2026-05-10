import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "../user/interface/user.interface";
import { Company } from "src/company/interface/company.interface";
import { isCompanyOperational } from "src/company/onboarding/onboarding.utils";

const getJwtfromSocketHeader = (client) => {
  return client.handshake.auth.token?.split(" ")[1];
};

@Injectable()
export class JwtSocketStrategy extends PassportStrategy(Strategy, "jwt-socket") {
  constructor(@InjectModel("User") private readonly UserModel: Model<User>,@InjectModel("Company") private readonly CompanyModel: Model<Company>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([getJwtfromSocketHeader]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET
    });
  }

  async validate(payload: any) {
    let user = await this.UserModel.findById(payload.id);
    if (!user) return false;
    if(user.role !== 'superadmin' && user.role !== 'admin' && user.role !== 'supervisor' && user.role !== 'batch'){
      let company = await this.CompanyModel.findById(user.companyId);
      if(!company || !isCompanyOperational(company.status)) return false;
      if(company.subscription?.endPeriod){
        let endPeriod = new Date(company.subscription.endPeriod);
        let today = new Date();
        if(today.getTime() > endPeriod.getTime()) return false
      }
    }

    if (payload.isLogged !== user.isLogged) return false;

    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      // role: user.role,
      role: payload.role,
      isActive: user.isActive,
      companyId:user.companyId,
      isLogged:user.isLogged
    };
  }
}
