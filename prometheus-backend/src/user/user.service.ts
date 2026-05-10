import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import * as bcrypt from "bcrypt";
import { plainToClass, plainToInstance } from "class-transformer";
import { Model } from "mongoose";
import * as nodemailer from "nodemailer";

import { ResponseSuccessDTO } from "../shared/dto/response-success.dto";
import { Messages } from "../shared/messages/messages.model";
import { CreateUserDTO } from "./dto/create-user.dto";
import { ResponseUserDTO } from "./dto/response-user.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";
import { User } from "./interface/user.interface";


import { ResponseCompanyDTO } from "src/company/dto/response.company.dto";
import { Company } from "src/company/interface/company.interface";
import { AppGateway } from "../gateway/app.gateway";
import { CreateAdminDTO } from "./dto/create-admin.dto";
import { ResponsePreviewsDTO } from "./dto/previews.dto";
import { ResponseAdminEmailDTO } from "./dto/response-admin-email";
import { UpdateAdminDTO } from "./dto/update-admin.dto";
import { UserRoleEnum } from "./enums/user-roles.enum";

@Injectable()
export class UserService {
  constructor(
    @InjectModel("User") private readonly UserModel: Model<User>,
    @InjectModel("Company") private readonly CompanyModel: Model<Company>,

    private readonly jwtService: JwtService,
    private gateway: AppGateway,
    //private readonly stripeClient: Stripe
  ) { }

  // async hashPass(passwordObj: { pass: string }) {
  //   return await bcrypt.hash(passwordObj.pass, 10);
  // }

  // async setContactPerson(){
  //   let users = await this.UserModel.find({ role: 'admin' });

  //   for(let user of users){
  //     user.subscriptionEmail = true
  //     if(user.companyId && !user.contactEmail){
  //       const company = await this.CompanyModel.findById(user.companyId);
  //       user.contactEmail = company.contactPerson.email;
  //     }
  //     await user.save();
  //   }
  // }

  async setSubscrioptionEmail(){
     let users = await this.UserModel.find({role: ['admin', 'broker', 'carrier']});

     for(let user of users){
      user.subscriptionEmail = true
      await user.save()
     }
  }

  async getUser(id: string): Promise<ResponseUserDTO> {
    try {
      const user = await this.UserModel.findById(id);
      return plainToClass(ResponseUserDTO, user)
    } catch {
      throw new NotFoundException()
    }

  }

  async getUserContact(id: string): Promise<ResponseUserDTO> {
    try {
      const user = await this.UserModel.findById(id);
      return plainToClass(ResponseUserDTO, {phone:user.phone,email:user.email})
    } catch {
      throw new NotFoundException()
    }

  }
  async getUsers(companyId: string,role:string): Promise<ResponseUserDTO[]> {
    try {
      
      if(role !== 'manager'){
        const users = await this.UserModel.find({ companyId: companyId, role: {$nin: [UserRoleEnum.Supervisor]} }).sort({createdAt: -1});
        return plainToInstance(ResponseUserDTO, users)
      }else{
        const users = await this.UserModel.find({ companyId: companyId, role: {$nin: [UserRoleEnum.Admin,UserRoleEnum.Supervisor,UserRoleEnum.Manager]} }).sort({createdAt: -1});
        return plainToInstance(ResponseUserDTO, users)
      }
    } catch {
      throw new NotFoundException()
    }

  }

  async getSupervisors(): Promise<ResponseUserDTO[]> {
    try {
      const users = await this.UserModel.find({role: UserRoleEnum.Supervisor}).sort({createdAt: -1});
      return plainToInstance(ResponseUserDTO, users)
    } catch {
      throw new NotFoundException()
    }

  }

  async addToPreviewedposts(userId,postId): Promise<ResponseUserDTO>  {
    try {
    let update = await this.UserModel.updateOne({_id:userId}, {$push: {previewedPosts: postId.postId}});

    return plainToInstance(ResponseUserDTO, update)
    } catch {
      throw new NotFoundException()
    }

  }

  async addToBlacklist(userId,companyId): Promise<ResponseCompanyDTO>  {

    try {
    let update = await this.UserModel.findOneAndUpdate({_id:userId}, {$push: {blacklist: companyId.companyId}}, {new:true});
    let company = await this.CompanyModel.findById(companyId.companyId)
    return plainToInstance(ResponseCompanyDTO, company)
    } catch {
      throw new NotFoundException()
    }

  }
  
  async removeFromBlacklist(userId,companyId): Promise<ResponseUserDTO>  {

    try {
    let update = await this.UserModel.updateOne({_id:userId}, {$pull: {blacklist: companyId.companyId}});

    return plainToInstance(ResponseUserDTO, update)
    } catch {
      throw new NotFoundException()
    }

  }
  

  async getBlacklist(userId)  {

    try {
    let user= await this.UserModel.findById(userId);
    let companies = await this.CompanyModel.find({_id:{$in:user.blacklist}})
   
    return companies 
    } catch {
      throw new NotFoundException()
    }
  }

  async getPreviews(userId): Promise<ResponsePreviewsDTO[]>  {

    try {
    let user= await this.UserModel.findById(userId);

    return plainToInstance(ResponsePreviewsDTO, user.previewedPosts)
    } catch {
      throw new NotFoundException()
    }

  }
  async getUsersByCompany(companyId: string,userId:string,role:string): Promise<ResponseUserDTO[]> {
    try {

      const users = await this.UserModel.find({ companyId: companyId, role: role, _id: {$ne: userId} });
      return plainToInstance(ResponseUserDTO, users)
    } catch {
      throw new NotFoundException()
    }

  }

  async getDraftAdmin(companyId: string): Promise<ResponseUserDTO> {
    try {

      const users = await this.UserModel.findOne({ companyId: companyId, role: UserRoleEnum.Admin });
      return plainToClass(ResponseUserDTO, users)
    } catch {
      throw new NotFoundException()
    }

  }



  async createAdmin(companyId: string, userDTO: CreateAdminDTO): Promise<ResponseUserDTO> {

    let company = await this.CompanyModel.findOne({ _id: companyId, filesUploaded: true })
    if (!company) {
      this.CompanyModel.findByIdAndDelete(companyId)
      throw new UnauthorizedException()
    }

    try {
      const normalizedEmail = String(userDTO.email ?? '').trim().toLowerCase();
      const existingUser = await this.UserModel.findOne({ email: normalizedEmail });

      if (existingUser) {
        const isSameDraftAdmin =
          String(existingUser.companyId ?? '') === String(companyId) &&
          existingUser.role === UserRoleEnum.Admin;

        if (isSameDraftAdmin) {
          const password = await bcrypt.hash(userDTO.password, 10);
          const updatedUser = await this.UserModel.findByIdAndUpdate(
            existingUser._id,
            {
              ...userDTO,
              email: normalizedEmail,
              role: UserRoleEnum.Admin,
              companyId,
              isActive: true,
              password,
              contactEmail: company.contactPerson?.email ?? company.email,
              subscriptionEmail: true
            },
            { new: true }
          );

          await this.CompanyModel.findByIdAndUpdate(companyId, { $set: { adminId: updatedUser._id } });

          return plainToClass(ResponseUserDTO, updatedUser);
        }

        throw new ConflictException(Messages.ExistingEmail);
      }

      const password = await bcrypt.hash(userDTO.password, 10)
      const user = await this.UserModel.create({
        ...userDTO,
        email: normalizedEmail,
        role: UserRoleEnum.Admin,
        companyId,
        isActive: true,
        password,
        contactEmail: company.contactPerson?.email ?? company.email,
        subscriptionEmail: true
      });
      if (!user)
        throw new InternalServerErrorException()

     
      // await this.stripeClient.customers.create({
      //       name: `${user.firstName} ${user.lastName}`,
      //       email: user.email,
      //       phone:user.phone,
      //       metadata: { _id: user._id }
      // })

      await this.CompanyModel.findByIdAndUpdate(companyId, { $set: { adminId: user._id } })

      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      if (err instanceof ConflictException || err instanceof UnauthorizedException) {
        throw err;
      }
      if (err?.code === 11000) {
        throw new ConflictException(Messages.ExistingEmail);
      }
      throw new InternalServerErrorException()
    }

  }

  async updateAdmin(companyId: string, userDTO: UpdateAdminDTO): Promise<ResponseUserDTO> {
    try {


      let data = { ...userDTO }
      if (userDTO.password)
        data.password = await bcrypt.hash(userDTO.password, 10)


      const user = await this.UserModel.findOneAndUpdate({ companyId }, data);
      if (!user)
        throw new NotFoundException()


      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      if (err.code == 11000)
        throw new ConflictException()
      throw new InternalServerErrorException()
    }

  }



  async createUser(companyId: string, userDTO: CreateUserDTO, origin: string): Promise<ResponseUserDTO> {
    try {

      let company = await this.CompanyModel.findById(companyId);
      let availableUsers = await this.UserModel.aggregate([
        {$match:{
          companyId,
          isActive:true,
          subscriptionEmail: true,
          $and: [{role:{$ne:'admin'}},{role:{$ne:'supervisor'}}]
        }}
      ]);
      if(availableUsers.length >= company.subscription.quantity){
        throw new UnauthorizedException()
      }

      const user = await this.UserModel.create({ ...userDTO, companyId, isActive: true });


      const token = this.jwtService.sign({ email: user.email });

          const html = `Dear ${user.firstName} ${user.lastName},<br>
 
          Thank you for creating an account with ${process.env.PROJECT_NAME}. In order to set up your account and access all of our services, we just need you to create a password.<br>
         
          Please click the following link to create your password: <a href="${origin}/create-password?id=${token}">${origin}</a><br>
         
          If you have any issues or need assistance, please don't hesitate to contact us.<br>
         
          Thank you,<br>
          ${process.env.PROJECT_NAME}`

      this.sendEmail([user.email], process.env.PROJECT_NAME + ": Create password", html);

      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      console.error(err)
      throw new InternalServerErrorException()
    }
  }

  async createSupervisor( userDTO: CreateUserDTO, origin: string): Promise<ResponseUserDTO> {
    try {
      const user = await this.UserModel.create({ ...userDTO, isActive: true });


      const token = this.jwtService.sign({ email: user.email });

      const html = `Dear ${user.firstName} ${user.lastName},<br>
 
      Thank you for creating an account with ${process.env.PROJECT_NAME}. In order to set up your account and access all of our services, we just need you to create a password.<br>
     
      Please click the following link to create your password: <a href="${origin}/create-password?id=${token}">${origin}</a> <br>
     
      If you have any issues or need assistance, please don't hesitate to contact us.<br>
     
      Thank you,<br>
      ${process.env.PROJECT_NAME}`

      this.sendEmail([user.email], process.env.PROJECT_NAME + ": Create password", html);

      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      throw new InternalServerErrorException()
    }
  }


  async changeUserStatus(userData): Promise<ResponseUserDTO> {
    try {

      let user =await this.UserModel.findOneAndUpdate({_id:userData.id},{$set: {isActive:userData.status}}, { new: true })

      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      throw new InternalServerErrorException()
    }

  }
  async changeForgottenPassword(password: string, encodedEmail: string, checkPasswordExists: boolean = true): Promise<ResponseSuccessDTO> {
    let token;

    try {
      token = this.jwtService.verify(encodedEmail);
    } catch (err) {
      if (err.message && err.message === Messages.JwtVerifyError) {
        throw new BadRequestException(Messages.InvalidLink);
      }
      if (err.message && err.message === Messages.JwtExpiredError) {
        throw new BadRequestException(Messages.ExpiredLink);
      }
      throw new InternalServerErrorException(err);
    }


    const user = await this.UserModel.findOne({
      email: token.email
    });

    if (!user) {
      throw new NotFoundException(Messages.DefaultErrorMessage);
    }

    if (!user.password && checkPasswordExists) {
      throw new BadRequestException(Messages.SetPassword);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    await user.save();

    return plainToClass(ResponseSuccessDTO, { message: checkPasswordExists ? Messages.PasswordChanged : Messages.PasswordCreated });
  }

  async updatePassword(data: any, userId: string, checkPasswordExists: boolean = true): Promise<ResponseSuccessDTO> {
    // let token;

    // try {
    //   token = this.jwtService.verify(encodedEmail);
    // } catch (err) {
    //   if (err.message && err.message === Messages.JwtVerifyError) {
    //     throw new BadRequestException(Messages.InvalidLink);
    //   }
    //   if (err.message && err.message === Messages.JwtExpiredError) {
    //     throw new BadRequestException(Messages.ExpiredLink);
    //   }
    //   throw new InternalServerErrorException(err);
    // }
    
    const user = await this.UserModel.findOne({
      _id: userId
    });
    if (!user) {
      throw new NotFoundException(Messages.DefaultErrorMessage);
    }
    const compare = await bcrypt.compare(data.currentPassword,user.password)

    if(!compare){
      throw new BadRequestException(Messages.PasswordMismatch);
    }

    if (!user.password && checkPasswordExists) {
      throw new BadRequestException(Messages.SetPassword);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    
    user.password = hashedPassword;

    await user.save();

    return plainToClass(ResponseSuccessDTO, { message: checkPasswordExists ? Messages.PasswordChanged : Messages.PasswordCreated });
  }

  async updateUser(userId: string, companyId: string, userDTO: UpdateUserDTO): Promise<ResponseUserDTO> {
    try {
      const user = await this.UserModel.findByIdAndUpdate({ _id: userId, companyId }, { ...userDTO, companyId}, { new: true });
      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      throw new NotFoundException()
    }

  }

  async updateMe(userId: string,companyId:string,userDTO: UpdateUserDTO): Promise<ResponseUserDTO> {
    try {
      const user = await this.UserModel.findByIdAndUpdate({ _id: userId, companyId }, { ...userDTO, companyId}, { new: true });
      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      throw new NotFoundException()
    }

  }

  async updateSupervisor(userId: string, supervisorDTO: UpdateUserDTO): Promise<ResponseUserDTO> {
    try {
      const user = await this.UserModel.findByIdAndUpdate({ _id: userId }, { ...supervisorDTO}, { new: true });
      return plainToClass(ResponseUserDTO, user)
    } catch (err) {
      throw new NotFoundException()
    }

  }

  private async sendEmail(targetEmail: Array<String>, emailSubject: string, htmlContent: string) {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: +process.env.MAIL_PORT,
      pool: true,
      secure: !!+process.env.MAIL_PORT_SECURE,
      auth: {
        user: process.env.MAIL_USER, // generated ethereal user
        pass: process.env.MAIL_PASSWORD // generated ethereal password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    await transporter.sendMail({
      from: process.env.PROJECT_NAME + " Service <" + process.env.MAIL_USER + ">",
      to: targetEmail as any, // list of receivers
      subject: emailSubject, // Subject line
      html: htmlContent // html body
    });
  }


  notify(id, data) {
    this.gateway.broadcast(id, data);
  }

  getAdminEmail(id):ResponseAdminEmailDTO{
    let adminEmail = this.UserModel.find({_id:id.id});
    return plainToInstance(ResponseAdminEmailDTO,adminEmail)
  }

  async forgottenPassword(email,origin){
    const token = this.jwtService.sign({ email: email });
    const html = ` Please open the following link to change your account password:<br>
    <a href="${origin}/reset-password?id=${token}"> Reset password </a><br><br>
    Best regards,<br>
    ${process.env.PROJECT_NAME}`;
    this.sendEmail([email], process.env.PROJECT_NAME + ": Reset password", html);
    
  }

  
}
