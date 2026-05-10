import * as mongoose from "mongoose";

import { User } from "../interface/user.interface";

export const UserSchema = new mongoose.Schema<User>(
  {
    
    companyId:mongoose.Schema.Types.ObjectId,
    email: { type: String, required: true, unique: true },
    password: String,
    role: String,
    firstName: String,
    lastName: String,
    emailConfirmation: Boolean,
    isActive: Boolean,
    phone: String,
    contactEmail:String,
    previewedPosts: Array,
    blacklist:Array,
    isLogged:String,
    lastLoggedInRole: String,
    subscriptionEmail: Boolean,
    messages:Array
  },
  {
    timestamps: true
  }
);
