import { forwardRef, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToClass, plainToInstance } from 'class-transformer';
import { Model } from 'mongoose';
import { Company } from 'src/company/interface/company.interface';
import { AppGateway } from 'src/gateway/app.gateway';
import { Messages } from 'src/messages/interface/messages.interface';
import { MatchingService } from 'src/matching/matching.service';
import { ResponseBrokerPostDTO } from 'src/post-broker/dto/response-post.dto';
import { PostBrokerService } from 'src/post-broker/post.service';
import { CreateCarrierPostDTO } from './dto/create-post.dto';
import { ResponseCarrierCompanyPins } from './dto/response-company-pins.dto';
import { ResponseCarrierPostDTO } from './dto/response-post.dto';
import * as nodemailer from "nodemailer";
import { notesCarrier } from './interface/notes.interface';
import { PostCarrier } from './interface/post.interface';
import { watchlistCarrier } from './interface/watchlist.interface';
import { ConfigService } from '@nestjs/config';
import { User } from '../user/interface/user.interface';
import { TimeZoneService, DateParts } from 'src/shared/services/timezone.service';
const DEFAULT_TIME_ZONE = 'America/Chicago';
const OVERLAP_GRACE_MS = 0;//60 * 1000;
@Injectable()
export class PostCarrierService {
  constructor(
    @InjectModel("carrierPost") private readonly PostModel: Model<PostCarrier>,
    @InjectModel("Company") private readonly CompanyModel: Model<Company>,
    @InjectModel("User") private readonly UserModel: Model<User>,
    @InjectModel("watchlistCarrier") private readonly watchlistModel: Model<watchlistCarrier>,
    @InjectModel("notesCarrier") private readonly notesModel: Model<notesCarrier>,
    @InjectModel("messages") private readonly messages: Model<Messages>,
    @Inject(forwardRef(() => PostBrokerService)) private brokerService: PostBrokerService,
    @Inject(forwardRef(() => MatchingService)) private readonly matchingService: MatchingService,
    private gateway: AppGateway,
    private readonly configService: ConfigService,
    private readonly timeZoneService: TimeZoneService,
  ) { }

  private buildCapacitySearch(value: any): string[] {
    const normalized = String(value ?? "both").trim().toLowerCase();
    const values = normalized === "both" || !normalized
      ? ["full", "partial"]
      : [normalized];
    const variants = values.flatMap((entry) => [
      entry,
      entry.toUpperCase(),
      entry.charAt(0).toUpperCase() + entry.slice(1),
    ]);
    return [...new Set(variants)];
  }

  private buildEquipmentSearch(value: any): string[] {
    const rawItems = Array.isArray(value) ? value : [value];
    const normalized = rawItems
      .map((item) => String(item ?? "").trim().toUpperCase())
      .filter(Boolean);
    const expanded = normalized.flatMap((code) => {
      if (code === "V" || code === "VZ") return ["V", "VZ"];
      if (code === "R" || code === "RZ") return ["R", "RZ"];
      if (code === "F" || code === "FZ") return ["F", "FZ"];
      if (code === "C" || code === "CZ") return ["C", "CZ"];
      if (code === "T" || code === "TZ") return ["T", "TZ"];
      return [code];
    });
    return [...new Set(expanded)];
  }


  // @Cron(CronExpression.EVERY_WEEKEND)
  async deleteOldPosts() {
    let today = new Date();
    let deleteDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    let posts = await this.PostModel.find({ startDate: { '$lt': deleteDate } })
    let data = await this.PostModel.deleteMany({ startDate: { '$lt': deleteDate } })
    let ids = posts.map(x => x._id.toString());
    await this.messages.deleteMany({ 'carrierPostId': { $in: ids } });
  }

  async createPost(postData: CreateCarrierPostDTO, companyId, userId): Promise<ResponseCarrierPostDTO> {

    let dhoRadius = 50;
    let dhdRadius = null;
    let company = await this.CompanyModel.findById(companyId);
    let date = new Date();
    if (postData.destination?.type === 'place') {
      dhdRadius = 50;
    }
    postData = { ...postData, company: company.name, publisherId: userId, publishedAt: date }
    await this.normalizeCarrierPostDates(postData);
    this.syncMongoGeo(postData.origin);
    this.syncMongoGeo(postData.destination);
    postData.origin.pinLocation = JSON.parse(JSON.stringify(postData.origin.location));
    postData.origin.pinLocation.coordinates.lat = postData.origin.location.coordinates.lat + (this.getRandom(-5, 5) / 100)
    postData.origin.pinLocation.coordinates.lng = postData.origin.location.coordinates.lng + (this.getRandom(-5, 5) / 100)
    try {
      const post = await this.PostModel.create({ ...postData, companyId, dhoRadius, dhdRadius, capacitySearch: 'both' });
      if (!post)
        throw new InternalServerErrorException();


      (post as any).companyData = company.toObject();
      const postToReturn: ResponseCarrierPostDTO = plainToClass(ResponseCarrierPostDTO, post)

      // send mail to all brokers
      // this.sendMailsForNewPost(postData);
      //notify all brokers in a background.

      this.brokerService.search(post, userId).then((brokerPostsToNotify: ResponseBrokerPostDTO[]) => {
        if (brokerPostsToNotify.length) {
          const companyIds: string[] = [...new Set(brokerPostsToNotify.map((item: ResponseBrokerPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_broker"
            const postsIds: Object[] = brokerPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {

              postToReturn.dho = this.findDistance(postToReturn.origin.location.coordinates.lat, postToReturn.origin.location.coordinates.lng, item.origin.location.coordinates.lat, item.origin.location.coordinates.lng);
              (item as any)._id = item._id.toString()
              return item._id

            });
            (postToReturn as any)._id = (postToReturn as any)._id.toString();
            this.gateway.broadcast(room, { type: "create", data: { post: postToReturn, postsIds } })
          }
        }
      })

      postToReturn.capacitySearch = 'both';
      this.triggerAssistantMatch(String((post as any)._id), userId);
      return postToReturn
    } catch (err) {
      console.log(err)
      throw new InternalServerErrorException()
    }

  }
  async editPost(postData, userId): Promise<ResponseCarrierPostDTO> {
    try {
      if (postData.destination?.type === 'place' && !postData.dhdRadius) {
        postData.dhdRadius = 50;
      } else {
        postData.dhdRadius = postData.dhdRadius;
      }
      let mongoose = require('mongoose')
      let id = new mongoose.Types.ObjectId(postData._id);
      await this.normalizeCarrierPostDates(postData);
      this.syncMongoGeo(postData.origin);
      this.syncMongoGeo(postData.destination);
      postData.origin.pinLocation = JSON.parse(JSON.stringify(postData.origin.location));;
      postData.origin.pinLocation.coordinates.lat = postData.origin.location.coordinates.lat + (this.getRandom(-5, 5) / 100)
      postData.origin.pinLocation.coordinates.lng = postData.origin.location.coordinates.lng + (this.getRandom(-5, 5) / 100)
      const editPost = await this.PostModel.findOneAndUpdate({ _id: id }, { $set: postData }, { new: true });
      if (!editPost)
        throw new InternalServerErrorException()



      const postToReturn: ResponseCarrierPostDTO = plainToClass(ResponseCarrierPostDTO, editPost)

      //notify all brokers in a background.
      this.brokerService.search(editPost, userId).then((brokerPostsToNotify: ResponseBrokerPostDTO[]) => {
        if (brokerPostsToNotify.length) {
          const companyIds: string[] = [...new Set(brokerPostsToNotify.map((item: ResponseBrokerPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_broker"
            const postsIds: Object[] = brokerPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {

              postToReturn.dho = this.findDistance(postToReturn.origin.location.coordinates.lat, postToReturn.origin.location.coordinates.lng, item.origin.location.coordinates.lat, item.origin.location.coordinates.lng)
              return item._id

            });
            (postToReturn as any)._id = (postToReturn as any)._id.toString();
            this.gateway.broadcast(room, { type: "edit", data: { post: postToReturn, postsIds } })
          }
        }
      })
      this.triggerAssistantMatch(String((editPost as any)._id), userId);
      return plainToClass(ResponseCarrierPostDTO, editPost)
    } catch (err) {
      console.log(err)
      throw new InternalServerErrorException()
    }

  }

  async updatePostTime(postId, userId, post, companyId) {
    try {
      let mongoose = require('mongoose')
      let id = new mongoose.Types.ObjectId(postId);
      let curDate = new Date();
      post.publishedAt = curDate;
      let company = await this.CompanyModel.findById(companyId);
      const updatePostTime = await this.PostModel.findOneAndUpdate({ _id: id }, post, { new: true });
      (updatePostTime as any).companyData = company.toObject();
      let postToReturn: ResponseCarrierPostDTO = plainToClass(ResponseCarrierPostDTO, updatePostTime);
      //(postToReturn as any) = updatePostTime.toObject();
      this.brokerService.search(updatePostTime, userId).then((brokerPostsToNotify: ResponseBrokerPostDTO[]) => {
        if (brokerPostsToNotify.length) {
          const companyIds: string[] = [...new Set(brokerPostsToNotify.map((item: ResponseBrokerPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_broker"
            const postsIds: Object[] = brokerPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {

              postToReturn.dho = this.findDistance(postToReturn.origin.location.coordinates.lat, postToReturn.origin.location.coordinates.lng, item.origin.location.coordinates.lat, item.origin.location.coordinates.lng);
              (item as any)._id = item._id.toString();
              return item._id

            });
            (postToReturn as any)._id = (postToReturn as any)._id.toString();
            this.gateway.broadcast(room, { type: "updateTime", data: { post: postToReturn, postsIds } })
          }
        }
      })
      if (!updatePostTime)
        throw new InternalServerErrorException()

      this.triggerAssistantMatch(String((updatePostTime as any)._id ?? postId), userId);
      return plainToClass(ResponseCarrierPostDTO, updatePostTime)
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException()
    }

  }

  async updateDHO(data) {
    try {
      const updatePostTime = await this.PostModel.findOneAndUpdate({ _id: data.id }, { dhoRadius: data.radiusDHO }, { new: true });
      if (!updatePostTime)
        throw new InternalServerErrorException()

      return plainToClass(ResponseCarrierPostDTO, updatePostTime)
    } catch (err) {
      throw new InternalServerErrorException()
    }

  }

  async updateDHD(data) {
    try {
      const updatePostTime = await this.PostModel.findOneAndUpdate({ _id: data.id }, { dhdRadius: data.radiusDHD }, { new: true });
      if (!updatePostTime)
        throw new InternalServerErrorException()

      return plainToClass(ResponseCarrierPostDTO, updatePostTime)
    } catch (err) {
      throw new InternalServerErrorException()
    }

  }


  async deletePost(id, userId) {
    try {
      const post = await this.PostModel.findOne({ _id: id }).lean() as any;
      if (!post)
        throw new InternalServerErrorException()
      post._id = post._id?.toString?.() ?? post._id;
      console.dir(post, { depth: null })

      this.brokerService.search(post, userId).then((brokerPostsToNotify: ResponseBrokerPostDTO[]) => {
        if (brokerPostsToNotify.length) {
          const companyIds: string[] = [...new Set(brokerPostsToNotify.map((item: ResponseBrokerPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_broker"
            const postsIds: Object[] = brokerPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {
              (item as any)._id = item._id.toString()
              return item._id

            })
            this.gateway.broadcast(room, { type: "delete", data: { post: post, postsIds } })
          }
        }
      })
      await this.PostModel.deleteOne({ _id: id });
      await this.messages.deleteMany({ carrierPostId: id })

    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException()
    }

  }

  async getPosts(userId, type, companyId): Promise<ResponseCarrierPostDTO[]> {

    let constraint;
    if (type === 'mine') {
      constraint = { publisherId: userId };
    } else if (type === 'all') {
      constraint = { companyId: companyId.toString() };
    } else {
      constraint = { publisherId: type };
    }
    try {
      const posts = await this.PostModel.aggregate([
        {
          $addFields: {
            convertedId: { $toObjectId: "$publisherId" },
            convertedCompanyId: { $toObjectId: "$companyId" },

          }
        },
        { $match: constraint },
        {
          $lookup: {
            from: 'users',
            localField: 'convertedId',
            foreignField: '_id',
            as: 'userData'
          },

        },
        {
          $lookup: {
            from: 'companies',
            localField: 'convertedCompanyId',
            foreignField: '_id',
            as: 'companyData'
          },

        },

        {
          $unwind: '$userData'
        }, {
          $unwind: '$companyData'
        }, {
          $sort: {
            publishedAt: -1
          }
        }
      ]);

      if (!posts)
        throw new InternalServerErrorException()

      return plainToInstance(ResponseCarrierPostDTO, posts)
    } catch (err) {
      console.log(err)
      throw new InternalServerErrorException()
    }

  }
  async search(data, userId): Promise<ResponseCarrierPostDTO[]> {
    const capacitySearch = this.buildCapacitySearch(data.capacitySearch);
    data = { ...data, equipment: this.buildEquipmentSearch(data.equipment) };

    return await this.doSearchOrineDestination(data, capacitySearch, userId)
  }

  async updateCapacitySearch(data) {
    try {
      const updatePostTime = await this.PostModel.findOneAndUpdate({ _id: data.id }, { capacitySearch: data.capacitySearch }, { new: true });
      if (!updatePostTime)
        throw new InternalServerErrorException()

      return plainToClass(ResponseCarrierPostDTO, updatePostTime)
    } catch (err) {
      throw new InternalServerErrorException()
    }

  }
  private async doSearchOrineDestination(data, capacitySearch, userId) {

    let today = new Date();
    let user = await this.UserModel.findById(userId.toString());
    let blacklist = (user as any).blacklist;
    let publishSearchDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4);
    const dateWindow = await this.buildSearchWindow(data);
    const dateExpr = this.buildDateOverlapExpr('startDate', 'endDate', dateWindow);
    const matchStage: any = {
      companyId: { $nin: blacklist },
      equipment: { $in: data.equipment },
      capacity: { $in: capacitySearch },
      length: { $gte: data.length },
      weight: { $gte: data.weight },
      publishedAt: { $gte: publishSearchDate },
      ...(dateExpr ? { $expr: dateExpr } : {}),
      $or: [
        {
          destination: null,
          'origin.geoLocation': {
            $geoWithin: {
              $centerSphere: [
                [data.origin.location.coordinates.lng, data.origin.location.coordinates.lat],
                data.dhoRadius / 3958.8
              ]
            }
          }
        },
        {
          'destination.type': 'states',
          'origin.geoLocation': {
            $geoWithin: {
              $centerSphere: [
                [data.origin.location.coordinates.lng, data.origin.location.coordinates.lat],
                data.dhoRadius / 3958.8
              ]
            }
          },
          'destination.states': {
            $in: [data.destination.place.state]
          }
        },
        {
          'destination.type': 'zones',
          'origin.geoLocation': {
            $geoWithin: {
              $centerSphere: [
                [data.origin.location.coordinates.lng, data.origin.location.coordinates.lat],
                data.dhoRadius / 3958.8
              ]
            }
          },
          'destination.zones.states': data.destination.place.state
        },
        {
          'destination.type': 'place',
          'origin.geoLocation': {
            $geoWithin: {
              $centerSphere: [
                [data.origin.location.coordinates.lng, data.origin.location.coordinates.lat],
                data.dhoRadius / 3958.8
              ]
            }
          },
          'destination.geoLocation': {
            $geoWithin: {
              $centerSphere: [
                [data.destination.location.coordinates.lng, data.destination.location.coordinates.lat],
                data.dhdRadius / 3958.8
              ]
            }
          }
        }
      ]
    };

    if (dateWindow?.start) {
      matchStage.startDate = {
        ...(matchStage.startDate ?? {}),
        $gte: dateWindow.start
      };
    }
    if (dateWindow?.end) {
      matchStage.startDate = {
        ...(matchStage.startDate ?? {}),
        $lte: dateWindow.end
      };
    }

    let results = await this.PostModel.aggregate(
      [{
        $addFields: {
          convertedId: { $toObjectId: "$publisherId" },
          convertedCompanyId: { $toObjectId: "$companyId" },
        },

      },
      {
        $match: matchStage,
      }, {
        $lookup: {
          from: 'users',
          localField: 'convertedId',
          foreignField: '_id',
          as: 'userData'
        }
      }, {
        $lookup: {
          from: 'companies',
          localField: 'convertedCompanyId',
          foreignField: '_id',
          as: 'companyData'
        }
      }, {
        $unwind: '$userData'
      },
      {
        $unwind: '$companyData'
      },
      {
        $lookup: {
          from: 'watchlist',
          localField: 'companyId',
          foreignField: 'companyId',
          as: 'watchlistData'
        }
      }
      ]
    )

    for (let i = 0; i < results.length; i++) {

      results[i].dho = this.findDistance(results[i].origin.location.coordinates.lat, results[i].origin.location.coordinates.lng, data.origin.location.coordinates.lat, data.origin.location.coordinates.lng)
      if (results[i].destination?.type === 'place') {

        results[i].dhd = this.findDistance(results[i].destination.location.coordinates.lat, results[i].destination.location.coordinates.lng, data.destination.location.coordinates.lat, data.destination.location.coordinates.lng)
      } else {
        results[i].dhd = null;
      }
    }

    results.sort((a, b) => {
      return b.publishedAt - a.publishedAt;
    });
    return results;
  }

  private buildDateOverlapExpr(startFieldPath: string, endFieldPath: string, window: { start: Date | null; end: Date | null }) {
    const clauses: any[] = [];
    if (window?.end) {
      clauses.push({
        $lte: [
          { $toDate: `$${startFieldPath}` },
          window.end
        ]
      });
    }
    if (window?.start) {
      const adjustedStart = new Date(window.start.getTime() - OVERLAP_GRACE_MS);
      clauses.push({
        $gte: [
          {
            $toDate: {
              $ifNull: [`$${endFieldPath}`, `$${startFieldPath}`]
            }
          },
          adjustedStart
        ]
      });
    }
    if (!clauses.length) {
      return null;
    }
    if (clauses.length === 1) {
      return clauses[0];
    }
    return { $and: clauses };
  }

  private async normalizeCarrierPostDates(postData: any): Promise<void> {
    if (!postData?.origin?.location?.coordinates) {
      return;
    }

    const coords = postData.origin.location.coordinates;
    const lat = Number(
      coords?.lat ?? coords?.latitude ?? coords?.[1]
    );
    const lng = Number(
      coords?.lng ?? coords?.longitude ?? coords?.[0]
    );

    const startParts =
      this.timeZoneService.extractDateParts(postData.startDate);
    const adjustEndParts = (parts: DateParts | null): DateParts | null => {
      if (!parts) {
        return null;
      }
      if (
        (parts.hour ?? 0) === 0 &&
        (parts.minute ?? 0) === 0 &&
        (parts.second ?? 0) === 0 &&
        (parts.millisecond ?? 0) === 0
      ) {
        return {
          ...parts,
          hour: 23,
          minute: 59,
          second: 59,
          millisecond: 999
        };
      }
      return parts;
    };
    const endParts = adjustEndParts(
      this.timeZoneService.extractDateParts(postData.endDate)
    );

    const referenceParts =
      startParts ??
      endParts ??
      this.timeZoneService.extractDateParts(new Date());

    if (!referenceParts) {
      return;
    }

    const originInfo = await this.timeZoneService.lookup(
      lat,
      lng,
      referenceParts
    );

    const offsetSeconds = originInfo?.offsetSeconds ?? null;

    const normalizedStartParts: DateParts = startParts
      ? { ...startParts }
      : {
          ...referenceParts,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        };

    let normalizedEndParts: DateParts;
    if (endParts) {
      normalizedEndParts = { ...endParts };
    } else {
      normalizedEndParts = {
        ...normalizedStartParts,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      };
    }

    const startDate = this.timeZoneService.buildDateFromParts(
      normalizedStartParts,
      offsetSeconds
    );
    let endDate = this.timeZoneService.buildDateFromParts(
      normalizedEndParts,
      offsetSeconds
    );

    if (endDate.getTime() < startDate.getTime()) {
      const adjustedEnd: DateParts = {
        ...normalizedStartParts,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      };
      endDate = this.timeZoneService.buildDateFromParts(
        adjustedEnd,
        offsetSeconds
      );
    }

    postData.startDate = startDate;
    postData.endDate = endDate;

    if (originInfo) {
      postData.origin.timeZoneId = originInfo.timeZoneId;
      postData.origin.timeZoneOffsetSeconds = originInfo.offsetSeconds;
    }

    if (postData.destination?.type === 'place') {
      const destCoords = postData.destination?.location?.coordinates;
      if (destCoords) {
        const destLat = Number(
          destCoords?.lat ?? destCoords?.latitude ?? destCoords?.[1]
        );
        const destLng = Number(
          destCoords?.lng ?? destCoords?.longitude ?? destCoords?.[0]
        );
        const destInfo = await this.timeZoneService.lookup(
          destLat,
          destLng,
          this.timeZoneService.extractDateParts(postData.endDate) ?? normalizedEndParts
        );
        if (destInfo) {
          postData.destination.timeZoneId = destInfo.timeZoneId;
          postData.destination.timeZoneOffsetSeconds =
            destInfo.offsetSeconds;
        }
      }
    }
  }

  private async buildSearchWindow(data): Promise<{ start: Date | null; end: Date | null }> {
    if (!data) {
      return { start: null, end: null };
    }

    const defaultRange = this.getDefaultCentralRange();

    const coords = data?.origin?.location?.coordinates;
    const lat = Number(
      coords?.lat ?? coords?.latitude ?? coords?.[1]
    );
    const lng = Number(
      coords?.lng ?? coords?.longitude ?? coords?.[0]
    );

    const rawStartValue = data?.stops?.[0]?.startDate ?? data?.startDate;
    const rawEndValue = data?.stops?.[0]?.endDate ?? data?.endDate;

    const startExisting = rawStartValue instanceof Date ? rawStartValue : null;
    const endExisting = rawEndValue instanceof Date ? rawEndValue : null;
    let startDate: Date | null = startExisting
      ? new Date(startExisting.getTime())
      : null;
    let endDate: Date | null = endExisting
      ? new Date(endExisting.getTime())
      : null;

    const startParts = startExisting
      ? null
      : this.timeZoneService.extractDateParts(rawStartValue);
    let endParts = endExisting
      ? null
      : this.timeZoneService.extractDateParts(rawEndValue);
    if (!endParts && startParts) {
      endParts = {
        ...startParts,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      };
    }

    const adjustEndParts = (parts: DateParts | null): DateParts | null => {
      if (!parts) {
        return null;
      }
      if ((parts.hour ?? 0) === 0 && (parts.minute ?? 0) === 0 && (parts.second ?? 0) === 0 && (parts.millisecond ?? 0) === 0) {
        return {
          ...parts,
          hour: 23,
          minute: 59,
          second: 59,
          millisecond: 999
        };
      }
      return parts;
    };

    endParts = adjustEndParts(endParts);

    const referenceParts =
      startParts ??
      endParts ??
      this.timeZoneService.extractDateParts(
        defaultRange.start ?? new Date()
      );

    if (!startParts && !endParts && !startExisting && !endExisting) {
      console.log('[carrier buildSearchWindow] defaultRange', {
        start: defaultRange.start?.toISOString(),
        end: defaultRange.end?.toISOString()
      });
      return defaultRange;
    }

    let offsetSeconds: number | null = null;
    if (Number.isFinite(lat) && Number.isFinite(lng) && referenceParts) {
      const info = await this.timeZoneService.lookup(
        lat,
        lng,
        referenceParts
      );
      offsetSeconds = info?.offsetSeconds ?? null;
    }

    if (offsetSeconds === null) {
      offsetSeconds = this.timeZoneService.getOffsetSecondsForZone(
        DEFAULT_TIME_ZONE,
        referenceParts
      );
    }

    const zoneOffset = offsetSeconds ?? 0;

    if (!startDate) {
      startDate = startParts
        ? this.timeZoneService.buildDateFromParts(startParts, zoneOffset)
        : defaultRange.start
        ? new Date(defaultRange.start.getTime())
        : null;
    }

    if (!endDate) {
      endDate = endParts
        ? this.timeZoneService.buildDateFromParts(endParts, zoneOffset)
        : defaultRange.end
        ? new Date(defaultRange.end.getTime())
        : null;
    }

    if (startDate && !endDate) {
      const baseParts = this.timeZoneService.extractDateParts(startDate) ?? {
        year: startDate.getUTCFullYear(),
        month: startDate.getUTCMonth() + 1,
        day: startDate.getUTCDate(),
        hour: startDate.getUTCHours(),
        minute: startDate.getUTCMinutes(),
        second: startDate.getUTCSeconds(),
        millisecond: startDate.getUTCMilliseconds()
      };
      const adjustedEnd: DateParts = {
        ...baseParts,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      };
      endDate = this.timeZoneService.buildDateFromParts(adjustedEnd, zoneOffset);
    }

    if (!startDate) {
      startDate = defaultRange.start;
    }

    if (!startDate) {
      return { start: null, end: null };
    }

    if (!endDate && defaultRange.end) {
      endDate = defaultRange.end;
    }

    if (endDate && endDate.getTime() < startDate.getTime()) {
      const baseParts = this.timeZoneService.extractDateParts(startDate) ?? {
        year: startDate.getUTCFullYear(),
        month: startDate.getUTCMonth() + 1,
        day: startDate.getUTCDate(),
        hour: startDate.getUTCHours(),
        minute: startDate.getUTCMinutes(),
        second: startDate.getUTCSeconds(),
        millisecond: startDate.getUTCMilliseconds()
      };
      const adjustedEnd: DateParts = {
        ...baseParts,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      };
      endDate = this.timeZoneService.buildDateFromParts(adjustedEnd, zoneOffset);
    }

    if (startDate) {
      startDate = new Date(startDate.getTime());
    }
    if (endDate) {
      endDate = new Date(endDate.getTime());
    }

    const result = { start: startDate, end: endDate ?? null };

    console.log('[carrier buildSearchWindow] window', {
      rawStartValue,
      rawEndValue,
      lat,
      lng,
      offsetSeconds,
      startIso: result.start?.toISOString(),
      endIso: result.end?.toISOString()
    });

    return result;
  }

  private async resolveDateRangeForOrigin(origin, startValue, endValue): Promise<{ start: Date | null; end: Date | null }> {
    const fallback = this.getDefaultCentralRange();

    const startExisting = startValue instanceof Date ? startValue : null;
    const endExisting = endValue instanceof Date ? endValue : null;

    const startParts = startExisting
      ? null
      : this.timeZoneService.extractDateParts(startValue);
    let endParts = endExisting
      ? null
      : this.timeZoneService.extractDateParts(endValue);

    const adjustEndParts = (parts: DateParts | null): DateParts | null => {
      if (!parts) {
        return null;
      }
      if ((parts.hour ?? 0) === 0 && (parts.minute ?? 0) === 0 && (parts.second ?? 0) === 0 && (parts.millisecond ?? 0) === 0) {
        return {
          ...parts,
          hour: 23,
          minute: 59,
          second: 59,
          millisecond: 999
        };
      }
      return parts;
    };

    endParts = adjustEndParts(endParts);

    if (!startParts && !endParts) {
      return {
        start: startExisting ?? fallback.start,
        end: endExisting ?? fallback.end
      };
    }

    const coords = origin?.location?.coordinates;
    const lat = Number(coords?.lat ?? coords?.latitude ?? coords?.[1]);
    const lng = Number(coords?.lng ?? coords?.longitude ?? coords?.[0]);

    let offsetSeconds: number | null = null;
    const referenceParts =
      startParts ??
      endParts ??
      this.timeZoneService.extractDateParts(fallback.start ?? new Date());

    if (Number.isFinite(lat) && Number.isFinite(lng) && referenceParts) {
      const info = await this.timeZoneService.lookup(lat, lng, referenceParts);
      offsetSeconds = info?.offsetSeconds ?? null;
    }

    if (offsetSeconds === null) {
      offsetSeconds = this.timeZoneService.getOffsetSecondsForZone(
        DEFAULT_TIME_ZONE,
        referenceParts
      );
    }

    const zoneOffset = offsetSeconds ?? 0;

    const startDate = startExisting ?? (startParts
      ? this.timeZoneService.buildDateFromParts(startParts, zoneOffset)
      : fallback.start);
    const endDate = endExisting ?? (endParts
      ? this.timeZoneService.buildDateFromParts(endParts, zoneOffset)
      : fallback.end);

    return { start: startDate, end: endDate };
  }

  private findDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == lat2 && lon1 == lon2) {
      return 0;
    } else {
      var radlat1 = (Math.PI * lat1) / 180;
      var radlat2 = (Math.PI * lat2) / 180;
      var theta = lon1 - lon2;
      var radtheta = (Math.PI * theta) / 180;
      var dist =
        Math.sin(radlat1) * Math.sin(radlat2) +
        Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
      if (dist > 1) {
        dist = 1;
      }
      dist = Math.acos(dist);
      dist = (dist * 180) / Math.PI;
      dist = dist * 60 * 1.1515;
      return Math.round(dist);
    }
  }


  async truckSearch(data, userId) {
    let user = await this.UserModel.findById(userId.toString());
    let blacklist = (user as any).blacklist;
    let origin = data?.origin;
    let destination = data?.destination;
    let dho = 50;
    let dhd = 50;


    if (data.dhoRadius) {
      dho = data.dhoRadius;
      delete data.dhoRadius;
    } else {
      delete data.dhoRadius;
    }
    if (data.dhdRadius) {
      dhd = data.dhdRadius;
      delete data.dhdRadius;
    } else {
      delete data.dhdRadius;
    }

    if (data.length) {
      data.length = { $lte: data.length }
    }

    if (data.weight) {
      data.weight = { $lte: data.weight }
    }
    if (data.capacity) {
      if (data.capacity === 'both') {
        data.capacity = ['full', 'partial']
      } else {
        data.capacity = [data.capacity]
      }
      data.capacity = { $in: data.capacity }
    }
    if (data.equipment) {
      data.equipment = { $in: data.equipment }
    }
    const resolvedRange = await this.resolveDateRangeForOrigin(
      data.origin,
      data.startDate,
      data.endDate
    );
    const dateExpr = this.buildDateOverlapExpr('firstStop.startDate', 'firstStop.endDate', resolvedRange);
    const startDateRange: any = {};
    if (resolvedRange?.start) {
      startDateRange.$gte = new Date(resolvedRange.start.getTime());
    }
    if (resolvedRange?.end) {
      startDateRange.$lte = new Date(resolvedRange.end.getTime());
    }
    console.log('[truckSearch] firstStop date range', {
      gte: startDateRange.$gte?.toISOString?.(),
      lte: startDateRange.$lte?.toISOString?.()
    });
    delete data.startDate;
    delete data.endDate;
    if (data.origin?.type === 'place') {
      data['origin.geoLocation'] = {
        $geoWithin: {
          $centerSphere: [[data?.origin?.location.coordinates.lng, data?.origin?.location.coordinates.lat], dho / 3958.8]
        }

      }
      delete data.origin
    }
    if (data.origin?.type === 'states') {
      data['origin.place.state'] = {
        $in: data?.origin?.states
      }
      delete data.origin
      delete data.startDate
      delete data.endDate
    }
    if (data.origin?.type === 'zones') {
      let states = []
      data.origin.zones.map(x => x.states.map(y => states.push(y)));
      data['$or'] = [{
        'origin.type': 'states', 'origin.states': {
          $in: states
        }
      },
      {
        'origin.type': 'place',
        'origin.place.state': {
          $in: states
        }
      }]
      delete data.origin
      delete data.startDate
      delete data.endDate
    }
    if (data.destination?.type === 'place') {
      data['destination.geoLocation'] = {
        $geoWithin: {
          $centerSphere: [[data?.destination?.location.coordinates.lng, data?.destination?.location.coordinates.lat], dhd / 3958.8]
        }
      }
      delete data.destination
    }
    if (data.destination?.type === 'states') {
      data['$or'] = [{
        'destination.type': 'states', 'destination.states': {
          $in: [data.destination.states]
        }
      },
      {
        'destination.type': 'place',
        'destination.place.state': {
          $in: [data.destination.states]
        }
      }]
      delete data.destination
    }
    if (data.destination?.type === 'zones') {
      let states = []
      data.destination.zones.map(x => x.states.map(y => states.push(y)));
      data['$or'] = [{
        'destination.type': 'states', 'destination.states': {
          $in: states
        }
      },
      {
        'destination.type': 'place',
        'destination.place.state': {
          $in: states
        }
      }]
      delete data.destination
      delete data.startDate
      delete data.endDate
    }
    // console.log(data);
    let results = await this.PostModel.aggregate(
      [{
        $addFields: {
          firstStop: { $arrayElemAt: ['$stops', 0] },
          firstStopStartDateUtc: {
            $toDate: {
              $ifNull: [
                { $arrayElemAt: ['$stops.startDate', 0] },
                '$startDate'
              ]
            }
          },
          convertedId: { $toObjectId: "$publisherId" },
          convertedPublisherId: { $toObjectId: "$publisherId" },
          convertedCompanyId: { $toObjectId: "$companyId" }
        }
      },
      {
        $match: { companyId: { $nin: blacklist }, ...data }
      },
      ...(Object.keys(startDateRange).length
        ? [{ $match: { 'firstStopStartDateUtc': startDateRange } }]
        : []),
      ...(dateExpr ? [{ $match: { $expr: dateExpr } }] : []),
      {
        $lookup: {
          from: 'users',
          localField: 'convertedPublisherId',
          foreignField: '_id',
          as: 'userData'
        },

      },
      {
        $lookup: {
          from: 'companies',
          localField: 'convertedCompanyId',
          foreignField: '_id',
          as: 'companyData'
        },

      },
      {
        $unwind: '$userData'
      },
      {
        $unwind: '$companyData'
      },
      ]
    )
    for (let i = 0; i < results.length; i++) {


      if (origin?.type === 'place') {
        results[i].dho = this.findDistance(results[i].origin.location.coordinates.lat, results[i].origin.location.coordinates.lng, origin.location.coordinates.lat, origin.location.coordinates.lng)
      }
      if (results[i].destination?.type === 'place' && destination?.type === 'place') {
        results[i].dhd = this.findDistance(results[i].destination.location.coordinates.lat, results[i].destination.location.coordinates.lng, destination.location.coordinates.lat, destination.location.coordinates.lng)
      } else {
        results[i].dhd = null;
      }
    }
    results.sort((a, b) => {
      return b.publishedAt - a.publishedAt;
    });
    return results
  }

  private getDefaultCentralRange(): { start: Date | null; end: Date | null } {
    const todayParts = this.timeZoneService.extractDateParts(new Date());
    if (!todayParts) {
      return { start: null, end: null };
    }
    const startParts: DateParts = {
      ...todayParts,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    const endParts: DateParts = {
      ...startParts,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999
    };
    const offset = this.timeZoneService.getOffsetSecondsForZone(
      DEFAULT_TIME_ZONE,
      startParts
    ) ?? 0;
    const startDate = this.timeZoneService.buildDateFromParts(startParts, offset);
    const endDate = this.timeZoneService.buildDateFromParts(endParts, offset);
    return { start: startDate, end: endDate };
  }


  async addToWatchlist(postData, companyId, userId) {
    const room: string = companyId + "_carrier"
    this.gateway.broadcast(room, { type: "addToWatchlist", data: { post: postData } })
    return await this.watchlistModel.create({ postId: postData._id, companyId, userId });
  }

  //   async addNote(note,companyId,userId,postId) {
  //       const room: string = companyId + "_carrier"
  //       // this.gateway.broadcast(room, { type: "addToWatchlist", data: { post: postData } })    
  //       return await this.notesModel.create({ postId: postId, companyId, userId });
  // }
  async getMessages(postId, companyId, userId) {
    let messages = await this.watchlistModel.find({ postId, companyId });

    return messages
  }
  async addNote(text, companyId, postId, name, lastName) {
    let noteData = { text: text.text, name, lastName, date: new Date() }
    const room: string = companyId + "_carrier"
    let check = await this.notesModel.find({ postId: postId.postId, companyId });
    if (check.length === 0) {
      await this.notesModel.create({ postId: postId.postId, companyId, notes: { ...noteData } })
    } else {
      await this.notesModel.findOneAndUpdate({ postId: postId.postId, companyId }, { $push: { notes: noteData } });
    }
    //this.gateway.broadcastForMessage(room, { type: "new", data: messageData })
    return noteData;
  }

  async getNotes(companyId, postId) {
    let notes = await this.notesModel.find({ companyId, postId });
    return notes;
  }
  async deleteFromWatchlist(id, companyId) {
    let watchlist = await this.watchlistModel.findById(id);
    const room: string = companyId + "_carrier"
    this.gateway.broadcast(room, { type: "removeFromWatchlist", data: { post: { _id: watchlist.postId } } })
    return await this.watchlistModel.deleteOne({ _id: id });
  }

  // async getWatchlist(companyId){
  //   let watchlist = await this.watchlistModel.aggregate([
  //     {$match:{companyId:companyId.toString()}},
  //     {
  //       $addFields: {
  //         convertedId: { $toObjectId: "$postId" },
  //       }
  //     },
  //     {
  //       $lookup: {
  //         from: 'brokerposts',
  //         localField: 'convertedId',
  //         foreignField: '_id',
  //         as: 'postData'
  //       }
  //     },
  //     {
  //       $unwind: '$postData'
  //     },
  //     {
  //       $group:{
  //         _id: 1,
  //         data: {$push: '$postData'}
  //       }
  //     },
  //     {
  //       $project:{data:1}
  //     },
  //   ])
  //   return watchlist[0];
  // }
  async createMessage(postId, companyId, messageData, name, lastName) {
    messageData.writtenBy.name = name;
    messageData.writtenBy.lastName = lastName;
    const room: string = companyId + "_carrier"
    let newMessage = await this.watchlistModel.findOneAndUpdate({ postId, companyId }, { $push: { comments: messageData } });
    this.gateway.broadcastForMessage(room, { type: "new", data: messageData })
    return newMessage;
  }


  async getSinglePost(postId): Promise<ResponseCarrierPostDTO> {
    let mongoose = require('mongoose')
    let id = new mongoose.Types.ObjectId(postId);
    let postAg = await this.PostModel.aggregate(
      [
        {
          $match: {
            _id: id
          }
        },
        {
          $addFields: {
            convertedId: { $toString: '$_id' },
            convertedCompanyId: { $toObjectId: "$companyId" }
          }

        },
        {
          $lookup: {
            from: 'brokerwatchlist',
            localField: 'convertedId',
            foreignField: 'postId',
            as: 'comments'
          },

        },
        {
          $lookup: {
            from: 'companies',
            localField: 'convertedCompanyId',
            foreignField: '_id',
            as: 'companyData'
          },

        },
        {
          $unwind: {
            path: '$comments',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $unwind: '$companyData'
        },
      ])
    return postAg[0]
  }
  getRandom(min, max) {
    return Math.random() * (max - min) + min;
  }

  async getMyCompanyPins(companyId, userId) {
    let pins = await this.PostModel.aggregate(
      [
        {
          $match: {
            companyId: companyId.toString(),
            publisherId: { $ne: userId.toString() }
          }
        },
        {
          $addFields: {
            userId: { $toObjectId: "$publisherId" },
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'userData'
          }
        },
        {
          $unwind: '$userData'
        },
      ])
    return plainToInstance(ResponseCarrierCompanyPins, pins)
  }

  async sendMailsForNewPost(postData) {
    let brokers = await this.UserModel.aggregate([
      {
        $match: { role: 'broker', subscriptionEmail:true }
      },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'companyData'
        }
      },
      {
        $unwind: '$companyData'
      },
      {
        $project: {
          email: 1,
          companyData: 1,
          contactEmail: 1
        }
      }
    ]);
    let admins = await this.UserModel.aggregate([
      {
        $match: { role: 'admin', companyId: { $exists: true }, subscriptionEmail:true }
      },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'companyData'
        }
      },
      {
        $unwind: '$companyData'
      },
      {
        $match: { 'companyData.type': 'both' }
      },
      {
        $project: {
          email: 1,
          companyData: 1,
          contactEmail: 1
        }
      }
    ]);

    let mails = [...brokers, ...admins];

    const today = new Date().toDateString();
    let equipment = this.getEquipmentsData(postData.equipment);
    for (let mail of mails) {
      let html = ` <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
        </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 20px;">
        <div style="padding: 20px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9;">
            <div style="font-size: 1.2em; margin-bottom: 10px;">
                Dear, <strong>${mail.companyData.name}</strong> we have a new post for you!
            </div>
            <div style="margin: 15px 0px;display:flex;justify-content:space-between;">
                <p>Date: <strong>${today}</strong></p>
                <p  style="margin-left: 10px">From: <strong>${postData.origin.place.city} ${postData.origin.place.state}</strong></p>
                <p  style="margin-left: 10px">Type: <strong>${equipment}</strong></p>
            </div>
            <p>If you want to review the post, please log in to your Prometheus account. <a href="${this.configService.get<string>("APP_URL") || "http://localhost:4300"}">Click here</a>.</p>
            <div style="margin-top: 20px; font-size: 0.9em; color: #555;">
                <p>If you have trouble logging to your account, please contact:</p>
                <p>Email: <a href="mailto:${this.configService.get<string>("SUPPORT_EMAIL") || "support@prometheus.local"}">${this.configService.get<string>("SUPPORT_EMAIL") || "support@prometheus.local"}</a></p>
                <p>Phone:<a href="tel:${this.configService.get<string>("SUPPORT_PHONE") || "(847) 230-7236"}">${this.configService.get<string>("SUPPORT_PHONE") || "(847) 230-7236"}</a></p>
            </div>
        </div>
    </body>
        </html>
        `;

      this.sendEmail(mail.contactEmail, `${this.configService.get<string>("PROJECT_NAME") || "Prometheus"}: New Post Notification `, html);
    }
    return;
  }

  private async sendEmail(targetEmail: string[], emailSubject: string, htmlContent: string) {
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>("MAIL_HOST"),
      port: +this.configService.get<string>("MAIL_PORT"),
      pool: true,
      secure: !!+this.configService.get<string>("MAIL_PORT_SECURE"), // true for gmail_port, false for other ports
      auth: {
        user: this.configService.get<string>("MAIL_USER"), // generated ethereal user
        pass: this.configService.get<string>("MAIL_PASSWORD") // generated ethereal password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    try {
      await transporter.sendMail({
        from: `${this.configService.get<string>("PROJECT_NAME") || "Prometheus"} <${this.configService.get<string>("MAIL_USER")}>`,
        to: targetEmail, // list of receivers
        subject: emailSubject, // Subject line
        html: htmlContent // html body
      });
      // console.log('mailSent to: ' + targetEmail)
    } catch (err) {
      console.error("Email not sent:", err);
    }
  }

  private getEquipmentsData(value) {
    let values = [
      { value: ["V", "R"], viewValue: 'Van / Reefer' },
      { value: ['V'], viewValue: 'Van only' },
      { value: ['R'], viewValue: 'Reefer' },
      { value: ["F"], viewValue: 'Flatbed' },
      { value: ["S"], viewValue: 'Step deck' },
      { value: ["P"], viewValue: 'Power only' },
      { value: ["C"], viewValue: 'Tanker' },
      { value: ["V", "F"], viewValue: 'Van / Flatbed' },
      { value: ["V", "R", "F"], viewValue: 'Van / Reefer / Flatbed' }
    ];
    for (let valueData of values) {
      if (JSON.stringify(valueData.value) === JSON.stringify(value)) {
        return valueData.viewValue
      }
    }
  }

  private toMongoPoint(location: any): { type: 'Point'; coordinates: [number, number] } | null {
    const lng = Number(location?.coordinates?.lng ?? location?.coordinates?.[0]);
    const lat = Number(location?.coordinates?.lat ?? location?.coordinates?.[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      type: 'Point',
      coordinates: [lng, lat]
    };
  }

  private syncMongoGeo(segment: any): void {
    if (!segment || typeof segment !== 'object') {
      return;
    }

    const geoPoint = this.toMongoPoint(segment.location);
    if (geoPoint) {
      segment.geoLocation = geoPoint;
    }
  }

  private triggerAssistantMatch(postId: string, userId: string): void {
    void this.matchingService
      .createAssistantSuggestionForPost("carrierPost", String(postId), String(userId))
      .catch((error) =>
        console.error("[HazmatHero] Carrier post assistant match failed", error?.message ?? error)
      );
  }
}
