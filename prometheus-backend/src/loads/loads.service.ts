import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRoleEnum } from "src/user/enums/user-roles.enum";
import { CreateLoadFromRoomDTO } from "./dto/create-load-from-room.dto";
import { DecideLoadAccessDTO, RequestLoadAccessDTO } from "./dto/load-access.dto";
import { UpdateLoadDTO } from "./dto/update-load.dto";
import { PrometheusLoad } from "./interface/load.interface";

@Injectable()
export class LoadsService {
  constructor(
    @InjectModel("prometheusLoad") private readonly loadModel: Model<PrometheusLoad>,
    @InjectModel("Messages") private readonly messagesModel: Model<any>,
    @InjectModel("brokerPost") private readonly brokerPostModel: Model<any>,
    @InjectModel("carrierPost") private readonly carrierPostModel: Model<any>,
    @InjectModel("User") private readonly userModel: Model<any>,
    @InjectModel("Company") private readonly companyModel: Model<any>,
  ) {}

  async getCompanyLoads(companyId: string): Promise<PrometheusLoad[]> {
    try {
      return (await this.loadModel
        .find({ companyId: String(companyId) })
        .sort({ status: 1, updatedAt: -1 })
        .lean<any[]>()) as PrometheusLoad[];
    } catch {
      throw new InternalServerErrorException();
    }
  }

  async getLoadById(loadId: string, companyId: string): Promise<PrometheusLoad> {
    const load = (await this.loadModel.findOne({ _id: loadId, companyId: String(companyId) }).lean<any>()) as
      | PrometheusLoad
      | null;
    if (!load) throw new NotFoundException("Load was not found.");
    return load;
  }

  async createFromRoom(data: CreateLoadFromRoomDTO, user: any): Promise<PrometheusLoad> {
    const companyId = String(user.companyId ?? "");
    const existing = await this.findExistingRoomLoad(companyId, data);
    if (existing) return existing as any;

    const [room, brokerPost, carrierPost] = await Promise.all([
      this.messagesModel.findOne({ brokerPostId: data.brokerPostId, carrierPostId: data.carrierPostId }).lean<any>(),
      this.brokerPostModel.findById(data.brokerPostId).lean<any>(),
      this.carrierPostModel.findById(data.carrierPostId).lean<any>(),
    ]);

    if (!room || !brokerPost || !carrierPost) {
      throw new NotFoundException("Prometheus could not resolve the booked room into a load.");
    }

    if (String(room.bookingStatus ?? "negotiating") !== "booked") {
      throw new ConflictException("Both sides must approve the booking before Prometheus can create the load.");
    }

    const ownsBrokerPost = String(brokerPost.companyId ?? "") === companyId;
    const ownsCarrierPost = String(carrierPost.companyId ?? "") === companyId;
    if (!ownsBrokerPost && !ownsCarrierPost) {
      throw new ForbiddenException("You can only create loads from your own company conversations.");
    }

    const [brokerUser, carrierUser, brokerCompany, carrierCompany] = await Promise.all([
      brokerPost.publisherId ? this.userModel.findById(brokerPost.publisherId).lean<any>() : null,
      carrierPost.publisherId ? this.userModel.findById(carrierPost.publisherId).lean<any>() : null,
      brokerPost.companyId ? this.companyModel.findById(brokerPost.companyId).lean<any>() : null,
      carrierPost.companyId ? this.companyModel.findById(carrierPost.companyId).lean<any>() : null,
    ]);

    const loadNumber = this.cleanString(data.loadNumber)
      || this.cleanString(brokerPost.refNum)
      || this.cleanString(carrierPost.refNum)
      || `LOAD-${Date.now()}`;

    try {
      const record = await this.loadModel.create({
        companyId,
        createdBy: String(user._id),
        creatorRole: String(user.role ?? ""),
        loadNumber,
        reference: loadNumber,
        status: "active",
        summary: this.cleanString(data.summary)
          || this.cleanComment(brokerPost.comment)
          || this.cleanComment(carrierPost.comment)
          || "Booked load ready for execution inside Prometheus.",
        lane: {
          origin: this.formatLocation(brokerPost.origin) || this.formatLocation(carrierPost.origin),
          destination: this.formatLocation(brokerPost.destination) || this.formatLocation(carrierPost.destination),
        },
        source: {
          brokerPostId: String(data.brokerPostId),
          carrierPostId: String(data.carrierPostId),
        },
        broker: {
          companyName: this.cleanString(brokerCompany?.name) || this.cleanString(brokerPost.companyName) || this.cleanString(brokerPost.company),
          contactName: this.contactName(brokerUser, brokerPost.companyFirstName, brokerPost.companyLastName),
          contactEmail: this.cleanString(brokerUser?.email) || this.cleanString(brokerPost.companyEmail),
          contactPhone: this.cleanString(brokerUser?.phone) || this.cleanString(brokerPost.companyPhone) || this.cleanString(brokerPost.contact),
        },
        carrier: {
          companyName: this.cleanString(carrierCompany?.name) || this.cleanString(carrierPost.companyName) || this.cleanString(carrierPost.company),
          contactName: this.contactName(carrierUser),
          contactEmail: this.cleanString(carrierUser?.email),
          contactPhone: this.cleanString(carrierUser?.phone) || this.cleanString(carrierPost.contact),
        },
        driver: {
          name: this.cleanString(data.driverName) || this.contactName(carrierUser),
          truckLabel: this.cleanString(data.truckLabel) || this.formatEquipmentLabel(carrierPost),
        },
        dispatch: {
          assignedDispatcherId: String(user._id),
          assignedDispatcherName: this.contactName(user) || user.email || "Prometheus dispatcher",
          assignedDispatcherEmail: this.cleanString(user.email),
        },
        equipmentLabel: this.formatEquipmentLabel(carrierPost) || this.formatEquipmentLabel(brokerPost),
        rate: this.asNumberOrNull(brokerPost.rate),
        weight: this.asNumberOrNull(carrierPost.weight) ?? this.asNumberOrNull(brokerPost.weight),
      });

      return record.toObject() as PrometheusLoad;
    } catch (error) {
      if (this.isDuplicateSourceLoadError(error)) {
        const duplicate = await this.findExistingRoomLoad(companyId, data);
        if (duplicate) return duplicate as any;
      }
      throw error;
    }
  }

  async updateLoad(loadId: string, companyId: string, user: any, data: UpdateLoadDTO): Promise<PrometheusLoad> {
    const load = await this.loadModel.findOne({ _id: loadId, companyId: String(companyId) });
    if (!load) throw new NotFoundException("Load was not found.");
    if (!this.canEdit(load, user)) {
      throw new ForbiddenException("This load is assigned to another dispatcher.");
    }

    if (data.status) load.status = data.status as any;
    if (data.statusNote !== undefined) load.statusNote = this.cleanString(data.statusNote);
    if (data.loadNumber !== undefined) {
      const loadNumber = this.cleanString(data.loadNumber);
      if (!loadNumber) throw new ConflictException("Load number cannot be empty.");
      load.loadNumber = loadNumber;
      load.reference = loadNumber;
    }
    if (data.summary !== undefined) load.summary = this.cleanString(data.summary);
    if (data.driverName !== undefined || data.truckLabel !== undefined) {
      load.driver = {
        ...load.driver,
        name: data.driverName !== undefined ? this.cleanString(data.driverName) : load.driver?.name,
        truckLabel: data.truckLabel !== undefined ? this.cleanString(data.truckLabel) : load.driver?.truckLabel,
      };
    }

    await load.save();
    return load.toObject() as PrometheusLoad;
  }

  async requestAccess(loadId: string, companyId: string, user: any, data: RequestLoadAccessDTO): Promise<PrometheusLoad> {
    const load = await this.loadModel.findOne({ _id: loadId, companyId: String(companyId) });
    if (!load) throw new NotFoundException("Load was not found.");

    const requesterId = String(user._id ?? "");
    if (this.loadOwnerId(load) === requesterId) {
      throw new ConflictException("This load is already assigned to you.");
    }

    const existingPending = (load.accessRequests ?? []).find((request) => (
      request.status === "pending"
      && String(request.requestedById) === requesterId
    ));
    if (existingPending) {
      return load.toObject() as PrometheusLoad;
    }

    const now = new Date();
    const requesterName = this.contactName(user) || this.cleanString(user.email) || "Prometheus user";
    const nextRequest = {
      id: `load-access-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
      requestedById: requesterId,
      requestedByName: requesterName,
      requestedByEmail: this.cleanString(user.email),
      requestedAt: now,
      targetDispatcherId: this.cleanString(load.dispatch?.assignedDispatcherId),
      targetDispatcherName: this.cleanString(load.dispatch?.assignedDispatcherName) || "Assigned dispatcher",
      status: "pending" as const,
      note: this.cleanString(data?.note),
    };

    load.accessRequests = [...(load.accessRequests ?? []), nextRequest];
    await load.save();
    return load.toObject() as PrometheusLoad;
  }

  async decideAccessRequest(
    loadId: string,
    requestId: string,
    companyId: string,
    user: any,
    data: DecideLoadAccessDTO
  ): Promise<PrometheusLoad> {
    const load = await this.loadModel.findOne({ _id: loadId, companyId: String(companyId) });
    if (!load) throw new NotFoundException("Load was not found.");

    const accessRequests = load.accessRequests ?? [];
    const requestIndex = accessRequests.findIndex((request) => request.id === requestId);
    if (requestIndex < 0) throw new NotFoundException("Access request was not found.");

    const request = accessRequests[requestIndex];
    if (request.status !== "pending") {
      throw new ConflictException("This access request has already been decided.");
    }

    if (!this.canApproveAccess(load, user)) {
      throw new ForbiddenException("Only the assigned dispatcher or a manager can approve load access.");
    }

    const now = new Date();
    const decidedByName = this.contactName(user) || this.cleanString(user.email) || "Prometheus user";
    const nextStatus = data.action === "approve" ? "approved" : "rejected";
    accessRequests[requestIndex] = {
      ...request,
      status: nextStatus,
      decidedById: String(user._id ?? ""),
      decidedByName,
      decidedAt: now,
      decisionNote: this.cleanString(data.note),
    };

    if (data.action === "approve") {
      load.dispatch = {
        assignedDispatcherId: this.cleanString(request.requestedById),
        assignedDispatcherName: this.cleanString(request.requestedByName) || "Assigned dispatcher",
        assignedDispatcherEmail: this.cleanString(request.requestedByEmail),
      };
    }

    load.accessRequests = accessRequests;
    await load.save();
    return load.toObject() as PrometheusLoad;
  }

  async deleteLoad(loadId: string, companyId: string, user: any): Promise<{ deleted: boolean; loadId: string }> {
    const load = await this.loadModel.findOne({ _id: loadId, companyId: String(companyId) });
    if (!load) throw new NotFoundException("Load was not found.");
    if (!this.canEdit(load, user)) {
      throw new ForbiddenException("This load is assigned to another dispatcher.");
    }

    await this.loadModel.deleteOne({ _id: loadId, companyId: String(companyId) });
    return { deleted: true, loadId };
  }

  private canEdit(load: PrometheusLoad, user: any): boolean {
    const role = String(user.role ?? "");
    if ([UserRoleEnum.Admin, UserRoleEnum.Manager, UserRoleEnum.Supervisor].includes(role as UserRoleEnum)) {
      return true;
    }
    return this.loadOwnerId(load) === String(user._id ?? "");
  }

  private canApproveAccess(load: PrometheusLoad, user: any): boolean {
    return this.canEdit(load, user);
  }

  private loadOwnerId(load: PrometheusLoad): string {
    return this.cleanString(load.dispatch?.assignedDispatcherId) || this.cleanString(load.createdBy);
  }

  private findExistingRoomLoad(companyId: string, data: CreateLoadFromRoomDTO): Promise<any> {
    return this.loadModel.findOne({
      companyId,
      "source.brokerPostId": data.brokerPostId,
      "source.carrierPostId": data.carrierPostId,
    }).lean<any>();
  }

  private isDuplicateSourceLoadError(error: any): boolean {
    return Number(error?.code) === 11000;
  }

  private cleanString(value: unknown): string {
    return String(value ?? "").trim();
  }

  private cleanComment(value: unknown): string {
    return this.cleanString(value).split("| Unit ")[0].trim();
  }

  private contactName(user: any, firstName?: unknown, lastName?: unknown): string {
    const fromUser = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    if (fromUser) return fromUser;
    return [firstName, lastName].filter(Boolean).map((item) => String(item).trim()).join(" ").trim();
  }

  private formatEquipmentLabel(post: any): string {
    if (!post) return "";
    const equipment = Array.isArray(post.equipment) ? post.equipment.filter(Boolean).join(", ") : "";
    const length = this.asNumberOrNull(post.length);
    if (equipment && length !== null) return `${equipment} ${length}'`;
    return equipment || (length !== null ? `${length}'` : "");
  }

  private formatLocation(location: any): string {
    if (!location) return "";
    if (location.type === "place" && location.place) {
      if (typeof location.place === "string") return location.place;
      return [location.place.city, location.place.state].filter(Boolean).join(", ");
    }
    if (Array.isArray(location.states) && location.states.length) return location.states.join(", ");
    if (Array.isArray(location.zones) && location.zones.length) return location.zones.map((zone) => zone?.zone).filter(Boolean).join(", ");
    return "";
  }

  private asNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
