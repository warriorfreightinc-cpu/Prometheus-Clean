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
      let mongoose = require('mongoose')
      const id = mongoose.Types.ObjectId((args.object as any)._id)
      //console.log(id);
      const existingEmail = await this.UserModel.findOne({ email ,_id:{$ne:id}});
      //console.log(existingEmail);
      //const validationOptions = args.constraints[0] as ValidationOptions;
      //const idField = validationOptions.idField;

    //  const id = args.object[idField];  // Extracting the id from the DTO
      if (existingEmail) {
        return false;
      }
    } catch (e) {
     // console.log(e);
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return Messages.ExistingEmail;
  }
}
