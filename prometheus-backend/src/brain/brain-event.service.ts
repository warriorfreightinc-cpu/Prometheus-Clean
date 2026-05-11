import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PrometheusBrainEvent } from "./interface/prometheus-brain-event.interface";

@Injectable()
export class BrainEventService {
  constructor(
    @InjectModel("prometheusBrainEvent")
    private readonly eventModel: Model<any>
  ) {}

  async record(event: PrometheusBrainEvent) {
    return this.eventModel.create(event);
  }

  async listForCompany(companyId: string, limit = 100) {
    return this.eventModel
      .find({ companyId: String(companyId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<any[]>();
  }
}
