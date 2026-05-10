import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CountersInterface } from "./interface/counters.interface";

@Injectable()
export class countersService {
  constructor(@InjectModel("Counters") private readonly CountersModel: Model<CountersInterface>) {}

}
