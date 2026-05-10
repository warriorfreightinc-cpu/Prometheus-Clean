import { Document } from "mongoose";

export interface User extends Document {
  
  companyId:string;
  email: string;
  password: string;
  role: string;
  firstName: string;
  lastName: string;
  emailConfirmation: boolean;
  phone: string;
  isActive: boolean;
  contactEmail:string;
  createdAt: Date;
  updatedAt: Date;
  previewedPosts:Array<String>,
  blacklist:Array<String>,
  isLogged:string,
  lastLoggedInRole:string,
  subscriptionEmail: boolean,
  messages:Array<String>
}
