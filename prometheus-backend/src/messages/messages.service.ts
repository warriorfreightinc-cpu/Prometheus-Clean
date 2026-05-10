import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { Model } from 'mongoose';
import { Company } from 'src/company/interface/company.interface';
import { AppGateway } from 'src/gateway/app.gateway';
import { RoomDTO } from './dto/create-room.dto';
import { BookingWorkflowAction, UpdateBookingWorkflowDTO } from './dto/update-booking-workflow.dto';
import { UpdateBookingStatusDTO } from './dto/update-booking-status.dto';
import { Messages } from './interface/messages.interface';
@Injectable()
export class MessagesService {
  constructor(
    @InjectModel("Company") private readonly CompanyModel: Model<Company>,
    @InjectModel("User") private readonly UserModel: Model<Company>,
    @InjectModel("Messages") private readonly messagesModel: Model<Messages>,
    private gateway: AppGateway
  ) { }

  async addMessage(data, role) {
    let date = new Date()
    let room;
    let $inc;
    let test;
    if (role === 'broker') {
      $inc = { 'seen.carrierCount': 1 }
    }

    if (role === 'carrier') {
      $inc = { 'seen.brokerCount': 1 }
    }
    if (data.type === 'bid') {
      test = { bid: Number(data.text), type: data.type, date, role: data.role }
    } else {
      test = { text: data.text, type: data.type, date, role: data.role }
    }
    let post = await this.messagesModel.findOneAndUpdate({ 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId }, { $push: { 'messages': test }, $inc, hiddenForBroker: false, hiddenForCarrier: false }, { new: true })
    if (role === 'broker') {
      room = post.carrierId
    }

    if (role === 'carrier') {
      room = post.brokerId
    }
    let maxBid;
    //console.log(post);
    let bids = [];
    (post.messages as any).filter(x => {
      if (x.type === 'bid') {
        bids.push(x.bid);
      }
      return x;
    });
    if (bids.length === 0) {
      maxBid = 'None'
    } else {
      maxBid = bids[bids.length - 1]
    }
    if (data.type === 'bid') {
      this.gateway.broadcast(room, { type: "bid", maxBid, data: { bid: data.text, type: "bid", date, role: data.role, 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId } })
    } else[
      this.gateway.broadcast(room, { type: "message", maxBid, data: { text: data.text, type: "message", date, role: data.role, 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId } })
    ]

  }

  async clearCount(data, role) {
    let seen;
    if (role === 'broker') {
      seen = { 'seen.brokerCount': 0 }
    }

    if (role === 'carrier') {
      seen = { 'seen.carrierCount': 0 }
    }

    let post = await this.messagesModel.findOneAndUpdate({ 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId }, seen)
  }

  async hideRoom(data, role) {
    //console.log(data);
    if (role === 'broker') {
      await this.messagesModel.findOneAndUpdate({ 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId }, { 'hiddenForBroker': true, 'seen.brokerCount': 0 })
    }
    if (role === 'carrier') {
      await this.messagesModel.findOneAndUpdate({ 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId }, { 'hiddenForCarrier': true, 'seen.carrierCount': 0 })
    }
  }

  async getMessage(data) {
    let result = await this.messagesModel.find({ 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId });
    return result[0].messages
  }
  async deleteRoom(data) {

    await this.messagesModel.deleteOne({ 'carrierPostId': data.carrierPostId, 'brokerPostId': data.brokerPostId });
  }

  async newMessagesDot(userId, role) {
    let result;
    let check = false;
    if (role === 'broker') {
      result = await this.messagesModel.find({ 'brokerId': userId });
      result = result.filter(x => {

        if (x.seen.brokerCount > 0) {
          return x;
        }
      })
    }

    if (role === 'carrier') {
      result = await this.messagesModel.find({ 'carrierId': userId });

      result = result.filter(x => {
        if (x.seen.carrierCount > 0) {
          return x;
        }
      })
    }
    return result
  }

  async getPosts(userId, role, otherPostId, myPostId) {
    // console.log('role', role)
    // console.log('posts')
    let find;
    let lookup;
    let convertId;
    let checkHidden;
    if (role === 'broker') {
      find = { brokerId: userId.toString() }
      checkHidden = { brokerPostId: myPostId, carrierPostId: otherPostId }
      lookup = {
        $lookup: {
          from: 'brokerposts',
          localField: 'convertedId',
          foreignField: '_id',
          as: 'postData'
        }
      }
      convertId = { $toObjectId: "$brokerPostId" };
      await this.messagesModel.findOneAndUpdate(checkHidden, { hiddenForBroker: false })

    }
    if (role === 'carrier') {
      find = { carrierId: userId.toString() }
      checkHidden = { brokerPostId: otherPostId, carrierPostId: myPostId }
      lookup = {
        $lookup: {
          from: 'carrierposts',
          localField: 'convertedId',
          foreignField: '_id',
          as: 'postData'
        }
      }
      convertId = { $toObjectId: "$carrierPostId" }
      await this.messagesModel.findOneAndUpdate(checkHidden, { hiddenForCarrier: false })
    }
    let rooms = await this.messagesModel.aggregate([
      { $match: find },
      {
        $addFields: {
          convertedId: convertId
        }
      },
      lookup,

    ]);
    let posts = [];
    let postsData = [];
    if (role === 'carrier') {
      rooms = rooms.filter(x => {
        if (!posts.includes(x.carrierPostId)) {

          posts.push(x.carrierPostId)
          postsData.push(x);
          if (!x.hiddenForCarrier) {
            postsData = postsData.map(y => {
              if (y.postData[0]._id.toString() === x.carrierPostId) {
                y.rooms = 1;
              }
              return y
            })
          }
          return x;
        } else {
          if (!x.hiddenForCarrier) {
            postsData = postsData.map(y => {
              if (y.postData[0]._id.toString() === x.carrierPostId) {
                y.rooms = 1;
              }
              return y
            })
          }
          if (x.seen.carrierCount > 0) {
            postsData.map(y => {
              if (y.postData[0]._id.toString() === x.carrierPostId) {
                y.seen.carrierCount = 1;
              }
              return y;
            })
          }
          return
        }
      })
    }

    if (role === 'broker') {
      rooms = rooms.filter(x => {
        if (!posts.includes(x.brokerPostId)) {
          posts.push(x.brokerPostId)
          postsData.push(x);
          if (!x.hiddenForBroker) {
            postsData = postsData.map(y => {
              if (y.postData[0]._id.toString() === x.brokerPostId) {
                y.rooms = 1;
              }
              return y
            })
          }
          return x;
        } else {
          // console.log(x);
          if (!x.hiddenForBroker) {
            postsData = postsData.map(y => {
              if (y.postData[0]._id.toString() === x.brokerPostId) {
                y.rooms = 1;
              }
              return y
            })
          }
          if (x.seen.brokerCount > 0) {
            postsData.map(y => {

              if (y.postData[0]._id.toString() === x.brokerPostId) {
                y.seen.brokerCount = 1;
              }
              return y;
            })
          }
          return
        }
      })
    }
    postsData = postsData.filter(x => x.rooms)
    return plainToInstance(RoomDTO, postsData);
  }

  async getRooms(data, role) {
    // console.log('rooms');
    let find;
    let lookup;
    let converted;
    if (role === 'broker') {
      find = { brokerPostId: data.postId, hiddenForBroker: false }
      lookup = {
        $lookup: {
          from: 'carrierposts',
          localField: 'convertedId',
          foreignField: '_id',
          as: 'post'
        }
      }
      converted = {
        convertedId: { $toObjectId: "$carrierPostId" },
        convertedBrokerId: { $toObjectId: "$carrierId" },
      }
    }
    if (role === 'carrier') {
      find = { carrierPostId: data.postId, hiddenForCarrier: false }
      lookup = {
        $lookup: {
          from: 'brokerposts',
          localField: 'convertedId',
          foreignField: '_id',
          as: 'post'
        }
      }
      converted = {
        convertedId: { $toObjectId: "$brokerPostId" },
        convertedBrokerId: { $toObjectId: "$brokerId" },
      }
    }
    let rooms = await this.messagesModel.aggregate([
      { $match: find },
      { $addFields: converted },
      lookup,
      {
        $lookup: {
          from: 'users',
          localField: 'convertedBrokerId',
          foreignField: '_id',
          as: 'user'
        },
      },
      { $unwind: '$post' },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'companies',
          localField: 'user.companyId',
          foreignField: '_id',
          as: 'company'
        },
      }, { $unwind: '$company' },

      // {
      //   $group: {
      //     _id: 1,
      //     post:{ $push: '$post' } ,
      //     user:{ $push: '$user' },
      //     seen:{$first:'$seen'},
      //     messages:{$first:'$messages'},
      //     maxField: { $max: '$messages.bid' }
      //   }
      // }
    ])

    return rooms;
  }

  async findRoomByPair(brokerPostId: string, carrierPostId: string) {
    const room = await this.messagesModel.findOne({ brokerPostId, carrierPostId }).lean<any>();
    if (!room) {
      throw new NotFoundException("Direct room was not found.");
    }
    return room;
  }

  async updateBookingStatus(data: UpdateBookingStatusDTO, user: any) {
    if (!["approve", "cancel"].includes(data.action)) {
      throw new BadRequestException("Unsupported booking action.");
    }

    const room = await this.findRoomByPair(data.brokerPostId, data.carrierPostId);
    const userId = String(user._id ?? "");
    const role = String(user.role ?? "");
    const isBrokerSide = role === "broker" && String(room.brokerId) === userId;
    const isCarrierSide = role === "carrier" && String(room.carrierId) === userId;
    const isManagerSide = ["admin", "manager", "supervisor"].includes(role);

    if (!isBrokerSide && !isCarrierSide && !isManagerSide) {
      throw new ForbiddenException("Only room participants can update booking status.");
    }

    const now = new Date();
    const update: any = {
      bookingStatusUpdatedAt: now,
      bookingStatusUpdatedBy: userId,
      bookingNotes: String(data.note ?? "").trim(),
    };

    if (data.action === "cancel") {
      update.bookingStatus = "cancelled";
      update.brokerApprovedBooking = false;
      update.carrierApprovedBooking = false;
      update.bookingCancelledAt = now;
      update.bookingConfirmedAt = null;
      update.bookingConfirmedBy = null;
      const updatedRoom = await this.messagesModel.findOneAndUpdate(
        { brokerPostId: data.brokerPostId, carrierPostId: data.carrierPostId },
        update,
        { new: true }
      );
      this.broadcastBookingStatus(updatedRoom);
      return updatedRoom;
    }

    const brokerApprovedBooking = isBrokerSide || isManagerSide ? true : Boolean(room.brokerApprovedBooking);
    const carrierApprovedBooking = isCarrierSide || isManagerSide ? true : Boolean(room.carrierApprovedBooking);
    update.brokerApprovedBooking = brokerApprovedBooking;
    update.carrierApprovedBooking = carrierApprovedBooking;

    if (brokerApprovedBooking && carrierApprovedBooking) {
      update.bookingStatus = "booked";
      update.bookingConfirmedAt = room.bookingConfirmedAt ?? now;
      update.bookingConfirmedBy = userId;
    } else {
      update.bookingStatus = "negotiating";
    }

    const updatedRoom = await this.messagesModel.findOneAndUpdate(
      { brokerPostId: data.brokerPostId, carrierPostId: data.carrierPostId },
      update,
      { new: true }
    );
    this.broadcastBookingStatus(updatedRoom);
    return updatedRoom;
  }

  async updateBookingWorkflow(data: UpdateBookingWorkflowDTO, user: any) {
    const allowedActions: BookingWorkflowAction[] = [
      "setup",
      "driver",
      "contact",
      "tracking",
      "delivered",
      "cancelled",
      "readyToBill",
    ];

    if (!allowedActions.includes(data.action)) {
      throw new BadRequestException("Unsupported booking workflow action.");
    }

    const room = await this.findRoomByPair(data.brokerPostId, data.carrierPostId);
    const userId = String(user._id ?? "");
    const role = String(user.role ?? "");
    const isBrokerSide = role === "broker" && String(room.brokerId) === userId;
    const isCarrierSide = role === "carrier" && String(room.carrierId) === userId;
    const isManagerSide = ["admin", "manager", "supervisor"].includes(role);

    if (!isBrokerSide && !isCarrierSide && !isManagerSide) {
      throw new ForbiddenException("Only room participants can update booking workflow.");
    }

    const now = new Date();
    const update: any = {
      "bookingWorkflow.updatedAt": now,
      "bookingWorkflow.updatedBy": userId,
    };

    this.setWorkflowString(update, "setupProvider", data.setupProvider);
    this.setWorkflowString(update, "setupLabel", data.setupLabel);
    this.setWorkflowString(update, "setupSource", data.setupSource);
    this.setWorkflowString(update, "driverId", data.driverId);
    this.setWorkflowString(update, "driverName", data.driverName);
    this.setWorkflowString(update, "truckLabel", data.truckLabel);
    this.setWorkflowString(update, "contactName", data.contactName);
    this.setWorkflowString(update, "contactEmail", data.contactEmail);
    this.setWorkflowString(update, "trackingProvider", data.trackingProvider);
    this.setWorkflowString(update, "trackingSource", data.trackingSource);
    this.setWorkflowString(update, "cancellationMode", data.cancellationMode);
    this.setWorkflowString(update, "cancellationNote", data.cancellationNote);
    this.setWorkflowBoolean(update, "contactSaved", data.contactSaved);
    this.setWorkflowBoolean(update, "trackingShared", data.trackingShared);
    this.setWorkflowBoolean(update, "readyToBill", data.readyToBill);

    if (data.action === "setup" || data.setupProvider || data.setupLabel || data.setupSource) {
      update["bookingWorkflow.setupUpdatedAt"] = now;
    }

    if (data.action === "driver" || data.driverId || data.driverName || data.truckLabel) {
      update["bookingWorkflow.driverUpdatedAt"] = now;
    }

    if (data.action === "contact" || data.contactSaved !== undefined || data.contactName || data.contactEmail) {
      update["bookingWorkflow.contactUpdatedAt"] = now;
    }

    if (data.action === "tracking" || data.trackingProvider || data.trackingSource || data.trackingShared !== undefined) {
      update["bookingWorkflow.trackingUpdatedAt"] = now;
    }

    if (data.action === "delivered" || data.delivered !== undefined) {
      const delivered = data.delivered ?? true;
      update["bookingWorkflow.delivered"] = delivered;
      update["bookingWorkflow.deliveredAt"] = delivered ? now : null;
      update.bookingStatus = delivered ? "delivered" : room.bookingStatus;
    }

    if (data.action === "cancelled" || data.cancellationMode || data.cancellationNote) {
      update["bookingWorkflow.cancelled"] = true;
      update["bookingWorkflow.cancellationAt"] = now;
      update.bookingStatus = "cancelled";
      update.bookingCancelledAt = now;
    }

    if (data.action === "readyToBill" || data.readyToBill !== undefined) {
      const readyToBill = data.readyToBill ?? true;
      update["bookingWorkflow.readyToBill"] = readyToBill;
      update["bookingWorkflow.readyToBillAt"] = readyToBill ? now : null;
    }

    const updatedRoom = await this.messagesModel.findOneAndUpdate(
      { brokerPostId: data.brokerPostId, carrierPostId: data.carrierPostId },
      update,
      { new: true }
    );
    this.broadcastBookingWorkflow(updatedRoom);
    return updatedRoom;
  }

  private broadcastBookingStatus(room: any): void {
    if (!room) return;
    const payload = room.toObject ? room.toObject() : room;
    const recipientIds = new Set(
      [payload.brokerId, payload.carrierId]
        .filter(Boolean)
        .map((id) => String(id))
    );

    recipientIds.forEach((recipientId) => {
      this.gateway.broadcast(recipientId, {
        type: "bookingStatusUpdated",
        data: payload,
      });
    });
  }

  private broadcastBookingWorkflow(room: any): void {
    if (!room) return;
    const payload = room.toObject ? room.toObject() : room;
    const recipientIds = new Set(
      [payload.brokerId, payload.carrierId]
        .filter(Boolean)
        .map((id) => String(id))
    );

    recipientIds.forEach((recipientId) => {
      this.gateway.broadcast(recipientId, {
        type: "bookingWorkflowUpdated",
        data: payload,
      });
    });
  }

  private setWorkflowString(update: any, key: string, value?: string): void {
    if (value === undefined) return;
    update[`bookingWorkflow.${key}`] = String(value).trim();
  }

  private setWorkflowBoolean(update: any, key: string, value?: boolean): void {
    if (value === undefined) return;
    update[`bookingWorkflow.${key}`] = Boolean(value);
  }

  async createRoom(data, userId, role) {

    let carrierPost;
    let brokerPost;
    let carrierId;
    let brokerId;
    userId = userId.toString();
    if (role === 'carrier') {
      carrierPost = data.myPostId
      brokerPost = data.otherPostId
      carrierId = userId;
      brokerId = data.otherUserId;
    } else {
      brokerPost = data.myPostId;
      carrierPost = data.otherPostId;
      brokerId = userId;
      carrierId = data.otherUserId;
    }
    let check: any = await this.messagesModel.find({ 'carrierPostId': carrierPost, 'brokerPostId': brokerPost });
    if (check.length) {
      return { created: false, room: check[0] }
    }
    userId = userId.toString();
    let createdRoom = await this.messagesModel.create({
      carrierPostId: carrierPost,
      brokerId,
      carrierId,
      brokerPostId: brokerPost,
      messages: [],
      seen: { brokerCount: 0, carrierCount: 0 },
      createdBy: role,
      hiddenForBroker: false,
      hiddenForCarrier: false,
      bookingStatus: "negotiating",
      brokerApprovedBooking: false,
      carrierApprovedBooking: false,
    });
    await this.UserModel.updateMany({ _id: { $in: [userId, data.otherUserId] } }, { $push: { 'messages': createdRoom._id } });
    return { created: true, room: createdRoom.toObject ? createdRoom.toObject() : createdRoom };

  }
}
