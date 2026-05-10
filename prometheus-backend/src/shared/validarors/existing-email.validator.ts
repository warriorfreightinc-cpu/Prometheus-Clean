import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";
import { Model } from "mongoose";
import { User } from "src/user/interface/user.interface";
import { Messages } from "../messages/messages.model";

interface ValidationOptions {
  additionalField?: string;
  idField?: string;
}

@ValidatorConstraint({ name: "EmailExists", async: true })
@Injectable()
export class EmailExists implements ValidatorConstraintInterface {
  constructor(@InjectModel("User") private readonly UserModel: Model<User>) {}

  async validate(email: string, args: ValidationArguments) {
    try {
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      if (!normalizedEmail) {
        return true;
      }

      let mongoose = require('mongoose')
      const rawId = (args.object as any)?._id;
      const query: any = { email: normalizedEmail };
      if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
        query._id = { $ne: new mongoose.Types.ObjectId(rawId) };
      }

      const existingEmail = await this.UserModel.findOne(query);
      return !existingEmail;
    } catch (e) {
     // console.log(e);
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return Messages.ExistingEmail;
  }
}
