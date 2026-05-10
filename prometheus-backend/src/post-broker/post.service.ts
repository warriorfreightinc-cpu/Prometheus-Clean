import { forwardRef, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToClass, plainToInstance } from 'class-transformer';
import axios from 'axios';
import * as mongoose from "mongoose";
import { Model, Types } from 'mongoose';
import { Company } from 'src/company/interface/company.interface';
import { AppGateway } from 'src/gateway/app.gateway';
import { Messages } from 'src/messages/interface/messages.interface';
import { MatchingService } from 'src/matching/matching.service';
import { ResponseCarrierPostDTO } from 'src/post-carrier/dto/response-post.dto';
import { PostCarrierService } from 'src/post-carrier/post.service';
import { CreateBrokerPostDTO } from './dto/create-post.dto';
import { ResponseBrokerCompanyPins } from './dto/response-company-pins.dto';
import { ResponseBrokerPostDTO } from './dto/response-post.dto';
import { notesBroker } from './interface/notes.interface';
import { PostBroker } from './interface/post.interface';
import { watchlistBroker } from './interface/watchlist.interface';
import * as nodemailer from "nodemailer";
import { ConfigService } from '@nestjs/config';
import { User } from '../user/interface/user.interface';
import { TimeZoneService, DateParts } from 'src/shared/services/timezone.service';

const LOADBOARD_ACCOUNT = {
  companyId: "68d53dbe83716b395750a8ca",
  userId: "68d53e3083716b395750a8dc",
};

const HAZMAT_REQUIRED_ERROR = 'Loadboard load rejected: hazmat flag not provided';
const EQUIPMENT_ALIAS_MAP: Record<string, string> = {
  v: 'V',
  f: 'F',
  r: 'R'
};
const DEFAULT_TIME_ZONE = 'America/Chicago';
const OVERLAP_GRACE_MS = 0;
const FIRST_STOP_START_FIELD = 'firstStopStartDate';
const FIRST_STOP_END_FIELD = 'firstStopEndDate';

@Injectable()
export class PostBrokerService {
  constructor(
    @InjectModel("brokerPost") private readonly PostModel: Model<PostBroker>,
    @InjectModel("Company") private readonly CompanyModel: Model<Company>,
    @InjectModel("User") private readonly UserModel: Model<User>,
    @InjectModel("watchlistBroker") private readonly watchlistModel: Model<watchlistBroker>,
    @InjectModel("notesBroker") private readonly notesModel: Model<notesBroker>,
    @InjectModel("messages") private readonly messages: Model<Messages>,
    @Inject(forwardRef(() => PostCarrierService)) private carrierService: PostCarrierService,
    @Inject(forwardRef(() => MatchingService)) private readonly matchingService: MatchingService,
    private readonly configService: ConfigService,
    private readonly timeZoneService: TimeZoneService,
    private gateway: AppGateway
  ) { }

  private geocodeCache = new Map<string, { lat: number; lng: number }>();

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

  async importFromLoadboardPayload(parsed: any) {
    const loadPostings = parsed?.LBNLoadPostings ?? {};
    const postingAccount = loadPostings?.PostingAccount ?? {};

    const loadCount = this.normalizeLoads(loadPostings?.PostLoads?.load).length;
    const removeCount = this.normalizeLoads(loadPostings?.RemoveLoads?.load).length;
    console.log('[LoadboardWebhook] Payload received:', {
      loads: loadCount,
      removes: removeCount
    });

    const companyId = LOADBOARD_ACCOUNT.companyId;
    const userId = LOADBOARD_ACCOUNT.userId;

    const companyName = this.ensureString(postingAccount?.CompanyName);
    const contactName = this.ensureString(postingAccount?.ContactName);
    const contactPhone = this.ensureString(postingAccount?.ContactPhone);
    const contactEmail = this.ensureString(postingAccount?.ContactEmail);;
    const dotNumber = this.ensureString(postingAccount?.dotNumber);
    const mcNumber = this.ensureString(postingAccount?.mcNumber);

    parsed.LBNLoadPostings = {
      ...loadPostings,
      PostingAccount: {
        ...postingAccount,
        CompanyName: companyName,
        ContactName: contactName,
        ContactPhone: contactPhone,
        ContactEmail: contactEmail
      }
    };

    const loads = this.normalizeLoads(parsed?.LBNLoadPostings?.PostLoads?.load);
    const removes = this.normalizeLoads(parsed?.LBNLoadPostings?.RemoveLoads?.load);

    if (!loads.length && !removes.length) {
      return {
        ok: true,
        created: 0,
        deleted: 0,
        failedCreates: 0,
        failedDeletes: 0,
        createResults: [],
        createErrors: [],
        deleteResults: [],
        deleteErrors: []
      };
    }

    const created: Array<{ postId: string | undefined; trackingNumber: string | null }> = [];
    const createFailures: Array<{ trackingNumber: string | null; error: string }> = [];
    const deleted: Array<{ postId: string; trackingNumber: string | null }> = [];
    const deleteFailures: Array<{ trackingNumber: string | null; error: string }> = [];

    const distanceApiKey = this.configService?.get<string>('AgmCoreModule') ?? process.env.AgmCoreModule;
    const requestDistance = async (
      originCoords: any,
      destinationCoords: any
    ): Promise<number | null> => {
      if (!distanceApiKey) {
        return null;
      }

      const originLat = Number(originCoords?.lat ?? originCoords?.latitude);
      const originLng = Number(originCoords?.lng ?? originCoords?.longitude);
      const destinationLat = Number(destinationCoords?.lat ?? destinationCoords?.latitude);
      const destinationLng = Number(destinationCoords?.lng ?? destinationCoords?.longitude);

      const hasValidCoords = [originLat, originLng, destinationLat, destinationLng].every(coord =>
        Number.isFinite(coord)
      );
      if (!hasValidCoords) {
        return null;
      }

      try {
        console.log('[PostBrokerService] Distance Matrix request', {
          origins: `${originLat},${originLng}`,
          destinations: `${destinationLat},${destinationLng}`
        });
        const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
          params: {
            origins: `${originLat},${originLng}`,
            destinations: `${destinationLat},${destinationLng}`,
            key: distanceApiKey,
            units: 'imperial'
          }
        });

        const element = response.data?.rows?.[0]?.elements?.[0];
        if (!element || element.status !== 'OK') {
          return null;
        }
        const miles = element?.distance?.value / 1609.344; // 1 mile = 1609.344 meters
        return Math.round(miles)

        // const distanceMeters = Number(element?.distance?.value);
        // if (!Number.isFinite(distanceMeters)) {
        //   return null;
        // }

        // const miles = distanceMeters / 1609.344;
        // if (!Number.isFinite(miles)) {
        //   return null;
        // }

        // return Math.max(Math.round(miles), 0);
      } catch (error) {
        console.error('[PostBrokerService] Distance lookup failed', error?.message ?? error);
        return null;
      }
    };

    for (const load of loads) {
      const trackingNumber = this.ensureString(load?.['tracking-number']) || null;
      if (trackingNumber) {
        const existing = await this.PostModel.findOne({
          refNum: trackingNumber,
          companyId
        }).lean();
        if (existing) {
          createFailures.push({
            trackingNumber,
            error: 'Duplicate tracking-number ignored'
          });
          continue;
        }
      }
      const { hasHazmat } = this.extractEquipment(load?.equipment);
      console.log('[LoadboardWebhook] Load received', {
        trackingNumber,
        hasHazmat
      });
      if (!hasHazmat) {
        createFailures.push({
          trackingNumber,
          error: HAZMAT_REQUIRED_ERROR
        });
        continue;
      }
      await this.ensureSegmentCoordinates(load?.origin);
      await this.ensureSegmentCoordinates(load?.destination);
      const resolvedDistance = await requestDistance(
        load?.origin?.location?.coordinates,
        load?.destination?.location?.coordinates
      );
  
      try {
        const payload = this.mapLoadToBrokerPost(load, contactPhone, dotNumber, mcNumber, companyName,
          contactName, contactName, contactEmail, contactPhone, resolvedDistance
        );
        if (typeof resolvedDistance === 'number' && Number.isFinite(resolvedDistance)) {
          (payload as any).distance = resolvedDistance;
          if (!Array.isArray((payload as any).stopsDistances)) {
            (payload as any).stopsDistances = [];
          }

          if ((payload as any).stopsDistances.length) {
            (payload as any).stopsDistances[0] = resolvedDistance;
          } else {
            (payload as any).stopsDistances.push(resolvedDistance);
          }
        }

        const result = await this.createPost(payload as any, companyId, userId);
        created.push({
          postId: result?._id?.toString?.(),
          trackingNumber: this.ensureString(load?.['tracking-number']) || null
        });
      } catch (error) {
        console.error('[PostBrokerService] Failed to create broker post from loadboard payload', error);
        createFailures.push({
          trackingNumber: this.ensureString(load?.['tracking-number']) || null,
          error: error?.message ?? 'Unknown error'
        });
      }
    }

    for (const remove of removes) {
      try {
        const trackingNumber = this.ensureString(remove?.['tracking-number']);
        if (!trackingNumber) {
          deleteFailures.push({
            trackingNumber: null,
            error: 'Missing tracking-number in RemoveLoads payload'
          });
          continue;
        }

        const existing = await this.PostModel.findOne({
          refNum: trackingNumber,
          companyId
        });

        if (!existing) {
          deleteFailures.push({
            trackingNumber,
            error: 'No post found for provided tracking-number'
          });
          continue;
        }

        await this.deletePost(existing._id.toString(), userId);
        deleted.push({
          postId: existing._id.toString(),
          trackingNumber
        });
      } catch (error) {
        console.error('[PostBrokerService] Failed to delete broker post from loadboard payload', error);
        deleteFailures.push({
          trackingNumber: this.ensureString(remove?.['tracking-number']) || null,
          error: error?.message ?? 'Unknown error'
        });
      }
    }

    return {
      ok: createFailures.length === 0 && deleteFailures.length === 0,
      created: created.length,
      deleted: deleted.length,
      failed: createFailures.length + deleteFailures.length,
      failedCreates: createFailures.length,
      failedDeletes: deleteFailures.length,
      createResults: created,
      createErrors: createFailures,
      deleteResults: deleted,
      deleteErrors: deleteFailures
    };
  }

  async deleteOldPosts () {
    let today = new Date();
    let deleteDate =new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1); 
    let posts = await this.PostModel.aggregate([{$match:{'stops.0.startDate':{'$lt': deleteDate}}}]);
    let data = await this.PostModel.deleteMany({'stops.0.startDate':{'$lt': deleteDate}});
    let ids = posts.map(x => x._id.toString());

    await this.messages.deleteMany({'brokerPostId':{$in:ids}});
  }

  async createPost(postData: CreateBrokerPostDTO, companyId, userId): Promise<ResponseBrokerPostDTO> {
    let date = new Date();


    postData = {
      ...postData,
      publishedAt: date,
      publisherId: userId,
      dhoRadius: 50,
      dhdRadius: 50,
      capacitySearch: 'both'
    };

    await this.normalizeNativeStops(postData.stops as any[]);
    this.applyStopTimezonesToPost(postData);
    this.syncMongoGeo(postData.origin);
    this.syncMongoGeo(postData.destination);

    postData.origin.pinLocation = JSON.parse(JSON.stringify(postData.origin.location));
    postData.origin.pinLocation.coordinates.lat =  postData.origin.location.coordinates.lat + (this.getRandom(-5,5) / 100)
    postData.origin.pinLocation.coordinates.lng  = postData.origin.location.coordinates.lng + (this.getRandom(-5,5) / 100)
    
    try {
      const post = await this.PostModel.create({ ...postData, companyId });
      if (!post)
        throw new InternalServerErrorException();

      const postToReturn: ResponseBrokerPostDTO = plainToClass(ResponseBrokerPostDTO, post);
      const company = await this.CompanyModel.findById(companyId);
      if (company) {
        (postToReturn as any).companyData = company.toObject();
      }
      this.applyLoadboardCompanyOverrides(postToReturn);

      this.carrierService.search(postToReturn,userId).then((carrierPostsToNotify: ResponseCarrierPostDTO[]) => {
        if (carrierPostsToNotify.length) {
          const companyIds: string[] = [...new Set(carrierPostsToNotify.map((item: ResponseCarrierPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_carrier"
            const postsIds: Object[] = carrierPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {
              postToReturn.dho = this.findDistance(postToReturn.origin.location.coordinates.lat,postToReturn.origin.location.coordinates.lng, item.origin.location.coordinates.lat, item.origin.location.coordinates.lng);
              (item as any)._id = item._id.toString();
              return item._id
            });
            (postToReturn as any)._id = (postToReturn as any)._id.toString();
            this.gateway.broadcast(room, { type: "create", data: { post: postToReturn, postsIds } })
          }
        }
      })

      postToReturn.capacitySearch = 'both'
      this.triggerAssistantMatch(String((post as any)._id), userId);
      return postToReturn
    } catch (err) {
      throw new InternalServerErrorException()
    }
  }

  private applyStopTimezonesToPost(postData: any) {
    if (!postData || !Array.isArray(postData.stops) || !postData.stops.length) {
      return;
    }

    const first = postData.stops[0];
    if (first?.place && postData.origin) {
      postData.origin.timeZoneId =
        first.place.timeZoneId ?? postData.origin.timeZoneId;
      postData.origin.timeZoneOffsetSeconds =
        first.place.timeZoneOffsetSeconds ??
        postData.origin.timeZoneOffsetSeconds;
    }

    const last = postData.stops[postData.stops.length - 1];
    if (last?.place && postData.destination) {
      postData.destination.timeZoneId =
        last.place.timeZoneId ?? postData.destination.timeZoneId;
      postData.destination.timeZoneOffsetSeconds =
        last.place.timeZoneOffsetSeconds ??
        postData.destination.timeZoneOffsetSeconds;
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

    const rawStart = data?.startDate;
    const rawEnd = data?.endDate;

    const parseExplicitDate = (value: any): Date | null => {
      if (value instanceof Date) {
        return new Date(value.getTime());
      }
      if (typeof value === 'string') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      return null;
    };

    const hasUtcTimeComponent = (date: Date | null): boolean => {
      if (!date) {
        return false;
      }
      return (
        date.getUTCHours() !== 0 ||
        date.getUTCMinutes() !== 0 ||
        date.getUTCSeconds() !== 0 ||
        date.getUTCMilliseconds() !== 0
      );
    };

    const explicitStart = parseExplicitDate(rawStart);
    const explicitEnd = parseExplicitDate(rawEnd);
    if (explicitStart && explicitEnd && hasUtcTimeComponent(explicitStart) && hasUtcTimeComponent(explicitEnd)) {
      console.log('[buildSearchWindow] explicit range', {
        start: explicitStart.toISOString(),
        end: explicitEnd.toISOString()
      });
      return { start: explicitStart, end: explicitEnd };
    }

    const startExisting = rawStart instanceof Date ? rawStart : null;
    const endExisting = rawEnd instanceof Date ? rawEnd : null;

    let startDate: Date | null = startExisting
      ? new Date(startExisting.getTime())
      : null;
    let endDate: Date | null = endExisting
      ? new Date(endExisting.getTime())
      : null;

    const startParts = startExisting
      ? null
      : this.timeZoneService.extractDateParts(rawStart);
    let endParts = endExisting
      ? null
      : this.timeZoneService.extractDateParts(rawEnd);
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
      console.log('[buildSearchWindow] defaultRange', {
        start: defaultRange.start?.toISOString(),
        end: defaultRange.end?.toISOString()
      });
      return defaultRange;
    }

    let offsetSeconds: number | null = null;
    let resolvedZoneId: string | null = null;
    if (Number.isFinite(lat) && Number.isFinite(lng) && referenceParts) {
      const info = await this.timeZoneService.lookup(
        lat,
        lng,
        referenceParts
      );
      offsetSeconds = info?.offsetSeconds ?? null;
      resolvedZoneId = info?.timeZoneId ?? null;
    }

    if (offsetSeconds === null) {
      offsetSeconds = this.timeZoneService.getOffsetSecondsForZone(
        DEFAULT_TIME_ZONE,
        referenceParts
      );
    }

    const zoneOffset = offsetSeconds ?? 0;
    const originZoneId =
      resolvedZoneId ??
      data?.origin?.timeZoneId ??
      data?.origin?.place?.timeZoneId ??
      DEFAULT_TIME_ZONE;

    if (data?.origin?.type === 'place' || data?.origin?.place?.timeZoneId || resolvedZoneId) {
      const baseStart = startParts ?? referenceParts;
      if (baseStart) {
        const localStart: DateParts = {
          ...baseStart,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        };
        const offsetStart =
          this.timeZoneService.getOffsetSecondsForZone(originZoneId, localStart) ?? zoneOffset;
        const startUtcMillis =
          Date.UTC(
            localStart.year,
            localStart.month - 1,
            localStart.day,
            localStart.hour ?? 0,
            localStart.minute ?? 0,
            localStart.second ?? 0,
            localStart.millisecond ?? 0
          ) - offsetStart * 1000;
        startDate = new Date(startUtcMillis);

        const localEnd: DateParts = endParts
          ? {
              ...endParts,
              hour: endParts.hour ?? 23,
              minute: endParts.minute ?? 59,
              second: endParts.second ?? 59,
              millisecond: endParts.millisecond ?? 999
            }
          : {
              ...localStart,
              hour: 23,
              minute: 59,
              second: 59,
              millisecond: 999
            };
        const offsetEnd =
          this.timeZoneService.getOffsetSecondsForZone(originZoneId, localEnd) ?? offsetStart;
        const endUtcMillis =
          Date.UTC(
            localEnd.year,
            localEnd.month - 1,
            localEnd.day,
            localEnd.hour ?? 0,
            localEnd.minute ?? 0,
            localEnd.second ?? 0,
            localEnd.millisecond ?? 0
          ) - offsetEnd * 1000;
        endDate = new Date(endUtcMillis);
      }
    } else {
      if (!startDate && startParts) {
        startDate = this.timeZoneService.buildDateFromParts(startParts, zoneOffset);
      } else if (!startDate && defaultRange.start) {
        startDate = new Date(defaultRange.start.getTime());
      }
      if (!endDate && endParts) {
        endDate = this.timeZoneService.buildDateFromParts(endParts, zoneOffset);
      } else if (!endDate && defaultRange.end) {
        endDate = new Date(defaultRange.end.getTime());
      }
    }

    if (startDate && !endDate) {
      const base = this.timeZoneService.extractDateParts(startDate) ?? {
        year: startDate.getUTCFullYear(),
        month: startDate.getUTCMonth() + 1,
        day: startDate.getUTCDate(),
        hour: startDate.getUTCHours(),
        minute: startDate.getUTCMinutes(),
        second: startDate.getUTCSeconds(),
        millisecond: startDate.getUTCMilliseconds()
      };
      const adjustedEnd: DateParts = {
        ...base,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      };
      endDate = this.timeZoneService.buildDateFromParts(
        adjustedEnd,
        zoneOffset
      );
    }

    if (!startDate) {
      startDate = defaultRange.start ? new Date(defaultRange.start.getTime()) : null;
    }

    if (!startDate) {
      return { start: null, end: null };
    }

    if (!endDate) {
      endDate = defaultRange.end ? new Date(defaultRange.end.getTime()) : null;
    }

    if (endDate && endDate.getTime() < startDate.getTime()) {
      const adjustedEnd: DateParts = {
        ...(this.timeZoneService.extractDateParts(startDate) ?? {
          year: startDate.getUTCFullYear(),
          month: startDate.getUTCMonth() + 1,
          day: startDate.getUTCDate(),
          hour: startDate.getUTCHours(),
          minute: startDate.getUTCMinutes(),
          second: startDate.getUTCSeconds(),
          millisecond: startDate.getUTCMilliseconds()
        }),
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      };
      endDate = this.timeZoneService.buildDateFromParts(
        adjustedEnd,
        zoneOffset
      );
    }

    const result = {
      start: startDate,
      end: endDate ?? null
    };

    console.log('[buildSearchWindow] window', {
      rawStart,
      rawEnd,
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

    const parseExplicit = (value: any): Date | null => {
      if (value instanceof Date) {
        return new Date(value.getTime());
      }
      if (typeof value === 'string') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      return null;
    };

    const hasUtcTimeComponent = (date: Date | null): boolean => {
      if (!date) {
        return false;
      }
      return (
        date.getUTCHours() !== 0 ||
        date.getUTCMinutes() !== 0 ||
        date.getUTCSeconds() !== 0 ||
        date.getUTCMilliseconds() !== 0
      );
    };

    const startExplicitDate = parseExplicit(startValue);
    const endExplicitDate = parseExplicit(endValue);

    if (
      startExplicitDate &&
      endExplicitDate &&
      (hasUtcTimeComponent(startExplicitDate) || hasUtcTimeComponent(endExplicitDate))
    ) {
      return {
        start: startExplicitDate,
        end: endExplicitDate
      };
    }

    const normalizeParts = (parts: DateParts | null, endOfDay = false): DateParts | null => {
      if (!parts) {
        return null;
      }
      if (!endOfDay) {
        return {
          ...parts,
          hour: parts.hour ?? 0,
          minute: parts.minute ?? 0,
          second: parts.second ?? 0,
          millisecond: parts.millisecond ?? 0
        };
      }
      return {
        ...parts,
        hour: parts.hour ?? 23,
        minute: parts.minute ?? 59,
        second: parts.second ?? 59,
        millisecond: parts.millisecond ?? 999
      };
    };

    const extract = (value: any): DateParts | null =>
      this.timeZoneService.extractDateParts(value);

    let startParts = extract(startValue);
    let endParts = extract(endValue);

    const isSameDay = startParts && endParts &&
      startParts.year === endParts.year &&
      startParts.month === endParts.month &&
      startParts.day === endParts.day;

    if ((!endParts && startParts) || isSameDay) {
      const base = startParts ?? endParts;
      if (base) {
        endParts = {
          ...base,
          hour: 23,
          minute: 59,
          second: 59,
          millisecond: 999
        };
      }
    }

    const hasOriginCoords = origin?.location?.coordinates || origin?.coordinates;
    const lat = Number(
      origin?.location?.coordinates?.lat ??
      origin?.location?.coordinates?.latitude ??
      origin?.location?.coordinates?.[1] ??
      origin?.coordinates?.lat ?? origin?.coordinates?.latitude ?? origin?.coordinates?.[1]
    );
    const lng = Number(
      origin?.location?.coordinates?.lng ??
      origin?.location?.coordinates?.longitude ??
      origin?.location?.coordinates?.[0] ??
      origin?.coordinates?.lng ?? origin?.coordinates?.longitude ?? origin?.coordinates?.[0]
    );

    const canResolveZone = Number.isFinite(lat) && Number.isFinite(lng);

    if (!startParts && !endParts && !canResolveZone) {
      return {
        start: startValue instanceof Date ? new Date(startValue.getTime()) : fallback.start,
        end: endValue instanceof Date ? new Date(endValue.getTime()) : fallback.end
      };
    }

    if (!startParts) {
      startParts = this.timeZoneService.extractDateParts(startValue instanceof Date ? startValue : fallback.start ?? new Date());
    }
    if (!endParts) {
      endParts = startValue
        ? this.timeZoneService.extractDateParts(endValue instanceof Date ? endValue : fallback.end ?? new Date())
        : null;
    }

    const referenceParts =
      startParts ?? endParts ?? this.timeZoneService.extractDateParts(new Date());

    let zoneId: string | null = null;
    let offsetSeconds: number | null = null;
    if (canResolveZone && referenceParts) {
      const info = await this.timeZoneService.lookup(lat, lng, referenceParts);
      zoneId = info?.timeZoneId ?? null;
      offsetSeconds = info?.offsetSeconds ?? null;
    }

    zoneId = zoneId ?? origin?.timeZoneId ?? origin?.place?.timeZoneId ?? DEFAULT_TIME_ZONE;
    if (offsetSeconds === null && referenceParts) {
      offsetSeconds = this.timeZoneService.getOffsetSecondsForZone(zoneId, referenceParts);
    }

    const applyOffset = (parts: DateParts | null): Date | null => {
      if (!parts) {
        return null;
      }
      const normalized = normalizeParts(parts, false);
      if (!normalized) {
        return null;
      }
      const offset = this.timeZoneService.getOffsetSecondsForZone(zoneId, normalized) ?? 0;
      const utcMillis = Date.UTC(
        normalized.year,
        normalized.month - 1,
        normalized.day,
        normalized.hour ?? 0,
        normalized.minute ?? 0,
        normalized.second ?? 0,
        normalized.millisecond ?? 0
      );
      return new Date(utcMillis - offset * 1000);
    };

    const startDate = applyOffset(startParts);
    const endDate = applyOffset(normalizeParts(endParts ?? startParts, true));

    return {
      start: startDate ?? fallback.start,
      end: endDate ?? fallback.end
    };
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

  async editPost(postData,userId): Promise<ResponseBrokerPostDTO> {
    try {
      let id = new mongoose.Types.ObjectId(postData._id);
      await this.normalizeNativeStops(postData.stops as any[]);
      this.applyStopTimezonesToPost(postData);
      this.syncMongoGeo(postData.origin);
      this.syncMongoGeo(postData.destination);

      postData.origin.pinLocation = JSON.parse(JSON.stringify(postData.origin.location));
      postData.origin.pinLocation.coordinates.lat =  postData.origin.location.coordinates.lat + (this.getRandom(-5,5) / 100)
      postData.origin.pinLocation.coordinates.lng  = postData.origin.location.coordinates.lng + (this.getRandom(-5,5) / 100)
      const editPost = await this.PostModel.findOneAndUpdate({ _id: id }, { $set: postData }, { new: true });
      if (!editPost)
        throw new InternalServerErrorException()

      const postToReturn: ResponseBrokerPostDTO = plainToClass(ResponseBrokerPostDTO, editPost);
      const company = await this.CompanyModel.findById(editPost.companyId);
      if (company) {
        (postToReturn as any).companyData = company.toObject();
      }
      this.applyLoadboardCompanyOverrides(postToReturn);
      this.carrierService.search(editPost,userId).then((carrierPostsToNotify: ResponseCarrierPostDTO[]) => {
        if (carrierPostsToNotify.length) {
          const companyIds: string[] = [...new Set(carrierPostsToNotify.map((item: ResponseCarrierPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_carrier"
            const postsIds: Object[] = carrierPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {
              postToReturn.dho = this.findDistance(postToReturn.origin.location.coordinates.lat,postToReturn.origin.location.coordinates.lng, item.origin.location.coordinates.lat, item.origin.location.coordinates.lng)
              return item._id
            });

            (postToReturn as any)._id = (postToReturn as any)._id.toString();
            this.gateway.broadcast(room, { type: "edit", data: { post: postToReturn, postsIds } })
          }
        }
      })

      this.triggerAssistantMatch(String((editPost as any)._id), userId);
      return plainToClass(ResponseBrokerPostDTO, editPost)
    } catch (err) {
      throw new InternalServerErrorException()
    }
  }

  async updatePostTime(postId,userId,post,companyId) {
    try {
      let id = new mongoose.Types.ObjectId(postId);
      let curDate = new Date();
      let newDate = new Date();
      newDate.setHours(0,0,0,0);
      let company = await this.CompanyModel.findById(companyId);
      post.publishedAt= curDate;
      
      const updatePostTime = await this.PostModel.findOneAndUpdate({ _id: id }, {...post}, { new: true });
      (updatePostTime as any).companyData = company.toObject();
      let postToReturn: ResponseBrokerPostDTO = plainToClass(ResponseBrokerPostDTO, updatePostTime);
      this.applyLoadboardCompanyOverrides(postToReturn);
      
      this.carrierService.search(updatePostTime,userId).then((carrierPostsToNotify: ResponseCarrierPostDTO[]) => {
        if (carrierPostsToNotify.length) {
          const companyIds: string[] = [...new Set(carrierPostsToNotify.map((item: ResponseCarrierPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_carrier"
            const postsIds: Object[] = carrierPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {
              postToReturn.dho = this.findDistance(postToReturn.origin.location.coordinates.lat,postToReturn.origin.location.coordinates.lng, item.origin.location.coordinates.lat, item.origin.location.coordinates.lng);
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
      return plainToClass(ResponseBrokerPostDTO, updatePostTime)
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

      return plainToClass(ResponseBrokerPostDTO, updatePostTime)
    } catch (err) {
      throw new InternalServerErrorException()
    }
  }

  async updateCapacitySearch(data) {
    try {
      const updatePostTime = await this.PostModel.findOneAndUpdate({ _id: data.id }, { capacitySearch: data.capacitySearch }, { new: true });
      if (!updatePostTime)
        throw new InternalServerErrorException()

      return plainToClass(ResponseBrokerPostDTO, updatePostTime)
    } catch (err) {
      throw new InternalServerErrorException()
    }
  }

  async updateDHD(data) {
    try {
      const updatePostTime = await this.PostModel.findOneAndUpdate({ _id: data.id }, { dhdRadius: data.radiusDHD }, { new: true });
      if (!updatePostTime)
        throw new InternalServerErrorException()

      return plainToClass(ResponseBrokerPostDTO, updatePostTime)
    } catch (err) {
      throw new InternalServerErrorException()
    }
  }

  async deletePost(id,userId) {
    try {
      const post = await this.PostModel.findOne({ _id: id }).lean() as any;
      if (!post) {
        throw new InternalServerErrorException();
      }
      post._id = post._id?.toString?.() ?? post._id;
      this.carrierService.search(post,userId).then((carrierPostsToNotify: ResponseCarrierPostDTO[]) => {
        if (carrierPostsToNotify.length) {
          const companyIds: string[] = [...new Set(carrierPostsToNotify.map((item: ResponseCarrierPostDTO) => item.companyId.toString()))];
          for (let cid of companyIds) {
            const room: string = cid + "_carrier"
            const postsIds: Object[] = carrierPostsToNotify.filter(item => item.companyId.toString() == cid).map(item => {
             (item as any)._id = item._id.toString() 
             return item._id
            })

            this.gateway.broadcast(room, { type: "delete", data: { post, postsIds } })
          }
        }
      })
      await this.PostModel.deleteOne({ _id: id });
      await this.messages.deleteMany({brokerPostId:id})
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException()
    }
  }

  async getSinglePost(postId): Promise<ResponseBrokerPostDTO> {
    let mongoose = require('mongoose')
    let id = new mongoose.Types.ObjectId(postId);
    let find = await this.PostModel.find({_id:postId})
    let postAg = await this.PostModel.aggregate(
      [
        {
          $match: {
            _id: id
          }
        },
        { $addFields: { 
          convertedId: { $toString: '$_id' } ,
          convertedCompanyId: { $toObjectId: "$companyId" }
      } },
        {
          $lookup: {
            from: 'carrierwatchlist',
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
          $unwind:{
            path :'$comments', 
            preserveNullAndEmptyArrays: true}
        }, {
          $unwind: '$companyData'
        }
      ])
    const post = postAg[0];
    this.applyLoadboardCompanyOverrides(post as any);
    return post;
  }

  async getPosts(userId, type, companyId): Promise<ResponseBrokerPostDTO[]> {
    let constraint: any = { companyId };
    if (type === 'mine') {
      constraint = { publisherId: userId };
    }else if  (type === 'all') {
      constraint = {companyId: companyId.toString()};
    }else{
      constraint = { publisherId: type};
    }

    try {
      const posts = await this.PostModel.aggregate([
        {
          $addFields: {
            convertedId: { $toObjectId: "$publisherId" },
            convertedCompanyId: { $toObjectId: "$companyId" }
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

      return plainToInstance(ResponseBrokerPostDTO, posts)
    } catch (err) {
      throw new InternalServerErrorException()
    }
  }

  async search(data, userId): Promise<ResponseBrokerPostDTO[]> {
    
    
    const capacitySearch = this.buildCapacitySearch(data.capacitySearch);
    data = { ...data, equipment: this.buildEquipmentSearch(data.equipment) };
    const dateWindow = await this.buildSearchWindow(data);
    if (data.destination) {
      if (data.destination.type === 'place') {
        return this.doSearchOrineDestinationForPlace(data, capacitySearch, userId, dateWindow);
      }
      if (data.destination.type === 'states') {
        return this.doSearchOrineDestinationForStates(data, capacitySearch, userId, dateWindow);
      }
      if (data.destination.type === 'zones') {
        return this.doSearchOrineDestinationForZones(data, capacitySearch, userId, dateWindow);
      }
    } else {
      return this.doSearchOrigineOnly(data, capacitySearch, userId, dateWindow);
    }
  }

  private async doSearchOrigineOnly(data, capacitySearch, userId, dateWindow: { start: Date | null; end: Date | null }) {
   

    let user = await this.UserModel.findById(userId.toString());
    let blacklist = (user as any).blacklist;
    let today = new Date();
    let publishSearchDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4);
    try {
      const dateExpr = this.buildDateOverlapExpr(FIRST_STOP_START_FIELD, FIRST_STOP_END_FIELD, dateWindow);
      const startDateRange: any = {};
      if (dateWindow?.start) {
        startDateRange.$gte = dateWindow.start;
      }
      if (dateWindow?.end) {
        startDateRange.$lte = dateWindow.end;
      }

      const baseQuery: any = {
        companyId: { $nin: blacklist },
        equipment: { $in: data.equipment },
        capacity: { $in: capacitySearch },
        length: { $lte: data.length },
        weight: { $lte: data.weight },
        publishedAt: { $gte: publishSearchDate },
      };
      let posts = await this.PostModel.aggregate([
        {
          $geoNear: {
            near: this.toMongoPoint(data.origin.location),
            key: 'origin.geoLocation',
            distanceField: "dho",
            maxDistance: data.dhoRadius * 1609.344,
            distanceMultiplier: 0.000621371,
            query: baseQuery,
            spherical: false,
          }
        },
        {
          $addFields: {
            ...this.buildFirstStopSearchFields(),
            convertedId: { $toObjectId: "$publisherId" },
            convertedCompanyId: { $toObjectId: "$companyId" }
          }
        },
        ...(Object.keys(startDateRange).length
          ? [{ $match: { [FIRST_STOP_START_FIELD]: startDateRange } }]
          : []),
        ...(dateExpr ? [{ $match: { $expr: dateExpr } }] : []),
        {
          $lookup: {
            from: 'users',
            localField: 'convertedId',
            foreignField: '_id',
            as: 'userData'
          }
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
        }
      ])
      
      posts.map(x => {
        x.dho = x.dho;
        x.dhd = null;
        return x
      })
      posts.forEach(post => this.applyLoadboardCompanyOverrides(post as any));
      posts.sort((a, b) => {
        return b.publishedAt - a.publishedAt;
      });
      
      return plainToInstance(ResponseBrokerPostDTO, posts)
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException()
    }
  }

  private async doSearchOrineDestinationForPlace(data, capacitySearch, userId, dateWindow: { start: Date | null; end: Date | null }) {
    
    
   
    
    
    let today = new Date();
    let user = await this.UserModel.findById(userId.toString());
    let blacklist = (user as any).blacklist;
    let publishSearchDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4);
    const dateExpr = this.buildDateOverlapExpr(FIRST_STOP_START_FIELD, FIRST_STOP_END_FIELD, dateWindow);
    console.log('[post search] window for place', {
      start: dateWindow?.start?.toISOString?.(),
      end: dateWindow?.end?.toISOString?.()
    });
    const startDateRange: any = {};
    if (dateWindow?.start) {
      startDateRange.$gte = dateWindow.start;
    }
    if (dateWindow?.end) {
      startDateRange.$lte = dateWindow.end;
    }
    const matchStage: any = {
      companyId: { $nin: blacklist },
      equipment: { $in: data.equipment },
      capacity: { $in: capacitySearch },
      length: { $lte: data.length },
      weight: { $lte: data.weight },
      publishedAt: { $gte: publishSearchDate },
      'origin.geoLocation': {
        $geoWithin: {
          $centerSphere: [[data.origin.location.coordinates.lng, data.origin.location.coordinates.lat], (data.dhoRadius) / 3958.8]
        }
      },
      'destination.geoLocation': {
        $geoWithin: {
          $centerSphere: [[data.destination.location.coordinates.lng, data.destination.location.coordinates.lat], (data.dhdRadius) / 3958.8]
        }
      }
    };


    console.log(matchStage)

    if (Object.keys(startDateRange).length) {
      matchStage[FIRST_STOP_START_FIELD] = {
        ...(matchStage[FIRST_STOP_START_FIELD] ?? {}),
        ...startDateRange
      };
    }

    if (dateExpr) {
      matchStage.$expr = dateExpr;
    }
    let results = await this.PostModel.aggregate(
      [{
        $addFields: {
          ...this.buildFirstStopSearchFields(),
          convertedId: { $toObjectId: "$publisherId" },
          convertedCompanyId: { $toObjectId: "$companyId" }
        }
      },
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: 'users',
          localField: 'convertedId',
          foreignField: '_id',
          as: 'userData'
        }
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
      }
      ]
    )

    for (let i = 0; i < results.length; i++) {
      results[i].dho = this.findDistance(results[i].origin.location.coordinates.lat,results[i].origin.location.coordinates.lng, data.origin.location.coordinates.lat, data.origin.location.coordinates.lng)
      results[i].dhd = this.findDistance(results[i].destination.location.coordinates.lat,results[i].destination.location.coordinates.lng, data.destination.location.coordinates.lat, data.destination.location.coordinates.lng)
    }
    results.forEach(result => this.applyLoadboardCompanyOverrides(result as any));
    results.sort((a, b) => {
      return b.publishedAt - a.publishedAt;
    });
    
    return results;
  }

  private async doSearchOrineDestinationForStates(data, capacitySearch, userId, dateWindow: { start: Date | null; end: Date | null }) {
    let user = await this.UserModel.findById(userId.toString());
    let blacklist = (user as any).blacklist;
    let today = new Date();
    let publishSearchDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4);
    const dateExpr = this.buildDateOverlapExpr(FIRST_STOP_START_FIELD, FIRST_STOP_END_FIELD, dateWindow);
    const startDateRange: any = {};
    if (dateWindow?.start) {
      startDateRange.$gte = dateWindow.start;
    }
    if (dateWindow?.end) {
      startDateRange.$lte = dateWindow.end;
    }
    const matchStage: any = {
      companyId: { $nin: blacklist },
      equipment: { $in: data.equipment },
      capacity: { $in: capacitySearch },
      length: { $lte: data.length },
      weight: { $lte: data.weight },
      publishedAt: { $gte: publishSearchDate },
      'origin.geoLocation': {
        $geoWithin: {
          $centerSphere: [[data.origin.location.coordinates.lng, data.origin.location.coordinates.lat], data.dhoRadius / 3958.8]
        }
      },
      'destination.place.state': { '$in': data.destination.states }
    };
    if (Object.keys(startDateRange).length) {
      matchStage[FIRST_STOP_START_FIELD] = {
        ...(matchStage[FIRST_STOP_START_FIELD] ?? {}),
        ...startDateRange
      };
    }
    if (dateExpr) {
      matchStage.$expr = dateExpr;
    }
    let results = await this.PostModel.aggregate(
      [
        {
          $addFields: {
            ...this.buildFirstStopSearchFields(),
            convertedId: { $toObjectId: "$publisherId" },
            convertedCompanyId: { $toObjectId: "$companyId" }
          }
        },
        {
          $match: matchStage
        },
        {
          $lookup: {
            from: 'users',
            localField: 'convertedId',
            foreignField: '_id',
            as: 'userData'
          }
        },
        {
          $lookup: {
            from: 'companies',
            localField: 'convertedCompanyId',
            foreignField: '_id',
            as: 'companyData'
          },
        }, {
          $unwind: '$companyData'
        },
        {
          $unwind: '$userData'
        }]
    )

    for (let i = 0; i < results.length; i++) {
      results[i].dho = this.findDistance(results[i].origin.location.coordinates.lat,results[i].origin.location.coordinates.lng, data.origin.location.coordinates.lat, data.origin.location.coordinates.lng)
    }
    results.forEach(result => this.applyLoadboardCompanyOverrides(result as any));
    results.sort((a, b) => {
      return a.publishedAt - b.publishedAt;
    });
    
    return results;
  }

  private async doSearchOrineDestinationForZones(data, capacitySearch, userId, dateWindow: { start: Date | null; end: Date | null }) {
    let allStates = [];
    let user = await this.UserModel.findById(userId.toString());
    let blacklist = (user as any).blacklist;
    data.destination.zones.map(x => allStates.push(x.states));
    allStates = allStates.flat(1);
    let today = new Date();
    let publishSearchDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4);
    const dateExpr = this.buildDateOverlapExpr(FIRST_STOP_START_FIELD, FIRST_STOP_END_FIELD, dateWindow);
    const startDateRange: any = {};
    if (dateWindow?.start) {
      startDateRange.$gte = dateWindow.start;
    }
    if (dateWindow?.end) {
      startDateRange.$lte = dateWindow.end;
    }
    const matchStage: any = {
      companyId: { $nin: blacklist },
      equipment: { $in: data.equipment },
      capacity: { $in: capacitySearch },
      length: { $lte: data.length },
      weight: { $lte: data.weight },
      publishedAt: { $gte: publishSearchDate },
      'origin.geoLocation': {
        $geoWithin: {
          $centerSphere: [[data.origin.location.coordinates.lng, data.origin.location.coordinates.lat], data.dhoRadius / 3958.8]
        }
      },
      'destination.place.state': { '$in': allStates }
    };
    if (Object.keys(startDateRange).length) {
      matchStage[FIRST_STOP_START_FIELD] = {
        ...(matchStage[FIRST_STOP_START_FIELD] ?? {}),
        ...startDateRange
      };
    }
    if (dateExpr) {
      matchStage.$expr = dateExpr;
    }
    let results = await this.PostModel.aggregate(
      [
        {
          $addFields: {
            ...this.buildFirstStopSearchFields(),
            convertedId: { $toObjectId: "$publisherId" },
            convertedCompanyId: { $toObjectId: "$companyId" }
          }
        },
        {
          $match: matchStage
        }, {
          $lookup: {
            from: 'users',
            localField: 'convertedId',
            foreignField: '_id',
            as: 'userData'
          }
        },
        {
          $lookup: {
            from: 'companies',
            localField: 'convertedCompanyId',
            foreignField: '_id',
            as: 'companyData'
          },
        }, {
          $unwind: '$companyData'
        },
        {
          $unwind: '$userData'
        }]
    )
    for (let i = 0; i < results.length; i++) {
      results[i].dho = this.findDistance(results[i].origin.location.coordinates.lat,results[i].origin.location.coordinates.lng, data.origin.location.coordinates.lat, data.origin.location.coordinates.lng)
    }
    results.forEach(result => this.applyLoadboardCompanyOverrides(result as any));
    results.sort((a, b) => {
      return b.publishedAt - a.publishedAt;
    });
    
    return results;
  }

  private applyLoadboardCompanyOverrides(post: ResponseBrokerPostDTO | null | undefined): void {
    if (!post) {
      return;
    }
    if (post.companyId?.toString() !== LOADBOARD_ACCOUNT.companyId) {
      return;
    }

    const mutablePost: any = post;
    mutablePost.companyData = mutablePost.companyData ?? {};

    if (mutablePost.companyName) {
      mutablePost.companyData.name = mutablePost.companyName;
      mutablePost.company = mutablePost.companyName;
    }
    if (mutablePost.companyDot) {
      mutablePost.companyData.dot = mutablePost.companyDot;
    }
    if (mutablePost.companyMc) {
      mutablePost.companyData.mc = mutablePost.companyMc;
    }
    if (mutablePost.companyPhone) {
      mutablePost.companyData.phone = mutablePost.companyPhone;
    }
    if (mutablePost.companyEmail) {
      mutablePost.companyData.email = mutablePost.companyEmail;
    }
    const fieldsToRemove = ['notes', 'subscription', 'fileNames', 'contactPerson', 'clientId', 'adminId', 'isWaiting'];
    for (const field of fieldsToRemove) {
      if (mutablePost.companyData && Object.prototype.hasOwnProperty.call(mutablePost.companyData, field)) {
        delete mutablePost.companyData[field];
      }
    }
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

  private buildFirstStopSearchFields() {
    return {
      firstStop: { $arrayElemAt: ['$stops', 0] },
      [FIRST_STOP_START_FIELD]: {
        $let: {
          vars: { stop: { $arrayElemAt: ['$stops', 0] } },
          in: {
            $toDate: {
              $ifNull: ['$$stop.startDate', { $ifNull: ['$$stop.date', '$startDate'] }]
            }
          }
        }
      },
      [FIRST_STOP_END_FIELD]: {
        $let: {
          vars: { stop: { $arrayElemAt: ['$stops', 0] } },
          in: {
            $toDate: {
              $ifNull: ['$$stop.endDate', { $ifNull: ['$$stop.date', { $ifNull: ['$$stop.startDate', '$startDate'] }] }]
            }
          }
        }
      }
    };
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

  async loadSearch(data,userId) {
    let user = await this.UserModel.findById(userId.toString());
    let blacklist = (user as any).blacklist;
    const origin = data?.origin;
    let destination = data?.destination;
    let dho = 50;
    let dhd = 50;

    if(data.dhoRadius){
      dho = data.dhoRadius;
      delete data.dhoRadius;
    }

    if(data.dhdRadius){
      dhd = data.dhdRadius;
      delete data.dhdRadius;
    }

    if (data.length) {
      data.length = { $lte: data.length }
    }

    if (data.weight) {
      data.weight = { $lte: data.weight }
    }
    if (data.capacity) {
      if(data.capacity=== 'both'){
        data.capacity = ['full','partial']
      }else{
        data.capacity = [data.capacity]
      }
      data.capacity = { $in: data.capacity }
    }

    if (data.equipment) {
      data.equipment = { $in: data.equipment }
    }
    
    const resolvedRange = await this.resolveDateRangeForOrigin(
      origin,
      data.startDate,
      data.endDate
    );
   
    const dateExpr = this.buildDateOverlapExpr(FIRST_STOP_START_FIELD, FIRST_STOP_END_FIELD, resolvedRange);
    const firstStopDateRange: any = {};
    if (resolvedRange?.start) {
      firstStopDateRange.$gte = new Date(resolvedRange.start.getTime());
    }
    if (resolvedRange?.end) {
      firstStopDateRange.$lte = new Date(resolvedRange.end.getTime());
    }
   

    delete data.startDate;
    delete data.endDate;
    if (data.origin?.type === 'states') {
      data['origin.place.state'] = {
        $in: data?.origin?.states
      }
      delete data.origin
    }
    if(data.origin?.type === 'zones' ){
      let states =[] 
      data.origin.zones.map(x => x.states.map( y => states.push(y)));
      data['$or']= [ {
        'origin.type': 'states', 'origin.states': {
          $in: states
        }
      },
      {
        'origin.type': 'place', 
        'origin.place.state': {
            $in: states
        }}]
      delete data.origin
    }
    if (data.origin?.type === 'place') {
      data['origin.geoLocation'] = {
        $geoWithin: {
          $centerSphere: [[data?.origin?.location?.coordinates.lng, data?.origin?.location?.coordinates.lat], dho / 3958.8]
        }
      }
      delete data.origin
    }
    if (data.destination?.type === 'states') {
      data['destination.place.state'] = {
        $in: data?.destination?.states
      }
      delete data.destination
    }
    if(data.destination?.type === 'zones' ){
      let states =[] 
      data.destination.zones.map(x => x.states.map( y => states.push(y)));
      data['$or']= [ {
        'destination.type': 'states', 'destination.states': {
          $in: states
        }
      },
      {
        'destination.type': 'place', 
        'destination.place.state': {
            $in: states
        }}]
      delete data.destination
    }
    if (data.destination?.type === 'place') {
      data['destination.geoLocation'] = {
        $geoWithin: {
          $centerSphere: [[data?.destination?.location?.coordinates.lng, data?.destination?.location?.coordinates.lat], dhd / 3958.8]
        }
      }
      delete data.destination
    }
    const pipeline: any[] = [
      {
        $addFields: {
          ...this.buildFirstStopSearchFields(),
          convertedId: { $toObjectId: "$publisherId" },
          convertedPublisherId: { $toObjectId: "$publisherId" },
          convertedCompanyId: { $toObjectId: "$companyId" }
        }
      },
      { $match: { companyId: { $nin: blacklist }, ...data } },
      ...(Object.keys(firstStopDateRange).length ? [{ $match: { [FIRST_STOP_START_FIELD]: firstStopDateRange } }] : []),
      ...(dateExpr ? [{ $match: { $expr: dateExpr } }] : []),
      {
        $lookup: {
          from: 'users',
          localField: 'convertedPublisherId',
          foreignField: '_id',
          as: 'userData'
        }
      },
      {
        $lookup: {
          from: 'companies',
          localField: 'convertedCompanyId',
          foreignField: '_id',
          as: 'companyData'
        }
      },
      { $unwind: '$userData' },
      { $unwind: '$companyData' }
    ];

    

    let results = await this.PostModel.aggregate(pipeline)

    for (let i = 0; i < results.length; i++) {
      if (origin?.type === 'place') {
        results[i].dho = this.findDistance(results[i].origin.location.coordinates.lat,results[i].origin.location.coordinates.lng, origin.location.coordinates.lat, origin.location.coordinates.lng, )
      }
      if (results[i].destination?.type === 'place' && destination?.type === 'place') {
        results[i].dhd = this.findDistance(results[i].destination.location.coordinates.lat,results[i].destination.location.coordinates.lng, destination.location.coordinates.lat, destination.location.coordinates.lng)
      }else{
        results[i].dhd = null;
      }

      this.applyLoadboardCompanyOverrides(results[i] as any);
    }
    results.sort((a, b) => {
      return b.publishedAt - a.publishedAt;
    });
    
    return results;
  }

  async getWatchlist(companyId) {
    let watchlist = await this.watchlistModel.aggregate([
      { $match: { companyId: companyId.toString() } },
      {
        $addFields: {
          convertedId: { $toObjectId: "$postId" },
          convertedCompanyId: { $toObjectId: "$companyId" }
        }
      },
      {
        $lookup: {
          from: 'carrierposts',
          localField: 'convertedId',
          foreignField: '_id',
          as: 'postData'
        }
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
        $unwind: '$postData'
      },
      {
        $unwind: '$companyData'
      },
      {
        $group: {
          _id: 1,
          data: { $push: '$postData' }
        }
      },
      {
        $project: { data: 1 }
      },
    ])
   
    return watchlist[0];
  }

  async addToWatchlist(postData, companyId, userId) {
    const room: string = companyId + "_broker"
    this.gateway.broadcast(room, { type: "addToWatchlist", data: { post: postData } })   
    return await this.watchlistModel.create({ postId: postData._id, companyId, userId });
  }

  async deleteFromWatchlist(id,companyId) {
    let watchlist = await this.watchlistModel.findById(id);
    const room: string = companyId + "_broker"
    this.gateway.broadcast(room, { type: "removeFromWatchlist", data: { post: {_id: watchlist.postId} } })   
    return await this.watchlistModel.deleteOne({_id:id});
  }

  async getMessages(postId, companyId, userId) {
    let messages = await this.watchlistModel.find({ postId, companyId });
    return messages
  }

  async addNote(text,companyId,postId,name,lastName) {
    let noteData = {text:text.text,name,lastName,date:new Date()}
    const room: string = companyId + "_carrier"
    let check = await this.notesModel.find({postId:postId.postId,companyId});
    if(check.length === 0){
      await this.notesModel.create({postId:postId.postId,companyId,notes:{...noteData}})
    }else{
     await this.notesModel.findOneAndUpdate({ postId:postId.postId, companyId }, {$push: {notes: noteData}});
    }
    return noteData;
  }
  
  async getNotes(companyId,postId) {
   let notes = await this.notesModel.find({companyId,postId});
    return notes;
  }

  async createMessage(postId, companyId, messageData, name, lastName) {
    messageData.writtenBy.name = name;
    messageData.writtenBy.lastName = lastName;
    const room: string = companyId + "_broker"
    let newMessage = await this.watchlistModel.findOneAndUpdate({ postId, companyId }, { $push: { comments: messageData } });
    this.gateway.broadcastForMessage(room, { type: "new", data: messageData })
    return newMessage;
  }

  getRandom(min,max){
    return Math.random() * (max - min) + min;
  }

  async getMyCompanyPins(companyId,userId){
    let pins = await this.PostModel.aggregate(
     [
       {
       $match: {
         companyId: companyId.toString(),
         publisherId: {$ne:userId.toString()}
       }
       } ,
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
    return plainToInstance(ResponseBrokerCompanyPins, pins)
  }

  async sendMailsForNewPost(postData) {
    let carriers = await this.UserModel.aggregate([{
      $match: { role: 'carrier', subscriptionEmail:true }
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
    let mails = [...carriers, ...admins];
    const today = new Date().toDateString();
    let equipment = this.getEquipmentsData(postData.equipment)
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
    `
      this.sendEmail(mail.contactEmail, `${this.configService.get<string>("PROJECT_NAME") || "Prometheus"}: New Post Notification `, html);
    }
    return;
  }

  private async sendEmail(targetEmail: string[], emailSubject: string, htmlContent: string) {
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>("MAIL_HOST"),
      port: +this.configService.get<string>("MAIL_PORT"),
      pool: true,
      secure: !!+this.configService.get<string>("MAIL_PORT_SECURE"),
      auth: {
        user: this.configService.get<string>("MAIL_USER"),
        pass: this.configService.get<string>("MAIL_PASSWORD")
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    try {
      await transporter.sendMail({
        from: `${this.configService.get<string>("PROJECT_NAME") || "Prometheus"} <${this.configService.get<string>("MAIL_USER")}>`,
        to: targetEmail,
        subject: emailSubject,
        html: htmlContent
      });
    } catch (err) {
      console.error("Email not sent:", err);
    }
  }

  private normalizeLoads(loads: any): any[] {
    if (!loads) {
      return [];
    }
    const list = Array.isArray(loads) ? loads : [loads];
    return list.filter(item => !!item);
  }

  private mapLoadToBrokerPost(load: any, contact: string, dotNumber: string, mcNumber: string, companyName: string,
    companyFirstName: string, companyLastName: string, companyEmail: string, companyPhone: string, distance: number
  ) {
    const { equipmentCodes, hasHazmat } = this.extractEquipment(load?.equipment);
    const origin = this.buildPlace(load?.origin);
    const destination = this.buildPlace(load?.destination);

    const originBaseParts =
      this.timeZoneService.extractDateParts(load?.origin?.['date-start']) ??
      this.timeZoneService.extractDateParts(load?.origin?.['date-end']) ??
      null;

    const pickupStop = this.buildStop('pickUp', origin, load?.origin, originBaseParts);
    const deliveryStop = this.buildStop('delivery', destination, load?.destination, originBaseParts);

    const rate = this.toNumber(load?.rate);
    const length = this.toNumber(load?.loadsize?.length);
    const weight = this.toNumber(load?.loadsize?.weight);

    if (!hasHazmat) {
      throw new Error(HAZMAT_REQUIRED_ERROR);
    }

    if (!equipmentCodes.length) {
      throw new Error('Loadboard load rejected: missing equipment type');
    }

    const allowedEquipment = new Set(['F', 'V', 'R']);
    const invalidEquipment = equipmentCodes.find(code => !allowedEquipment.has(code));
    if (invalidEquipment) {
      throw new Error(`Loadboard load rejected: unsupported equipment type ${invalidEquipment}`);
    }

    const normalizedLength = typeof length === 'number' ? Math.max(0, length) : 0;
    const normalizedWeight = typeof weight === 'number' ? Math.max(0, weight * 1000) : 0;
    const normalizedRate = typeof rate === 'number' && Number.isFinite(rate) ? rate : null;

    const resolvedEquipment = Array.from(new Set(equipmentCodes)).sort();

    const companyDot = dotNumber;
    const companyMc =  mcNumber;

    return {
      length: normalizedLength,
      weight: normalizedWeight,
      capacity: this.extractCapacity(load),
      equipment: resolvedEquipment,
      contact: this.ensureString(contact),
      comment: this.ensureString(load?.comment),
      bookUrl: null,
      refNum: this.ensureString(load?.['tracking-number']),
      tankerEndorsement: false,
      nonHazmat: !hasHazmat,
      team: false,
      rate: normalizedRate,
      stops: [pickupStop, deliveryStop],
      // stopsDistances,
      origin,
      destination,
      companyDot,
      companyMc,
      companyName,
      companyFirstName,
      companyLastName,
      companyEmail,
      companyPhone,
      distance
    };
  }

  private buildStop(
    type: 'pickUp' | 'delivery',
    place: any,
    segment: any,
    fallbackParts?: DateParts | null
  ) {
    const startPartsOrig = this.timeZoneService.extractDateParts(
      segment?.['date-start']
    );
    const endPartsOrig = this.timeZoneService.extractDateParts(
      segment?.['date-end']
    );

    let offsetSeconds: number | null =
      typeof segment?.timeZoneOffsetSeconds === 'number'
        ? segment.timeZoneOffsetSeconds
        : null;

    if (offsetSeconds === null) {
      offsetSeconds =
        startPartsOrig?.offsetSeconds ??
        endPartsOrig?.offsetSeconds ??
        fallbackParts?.offsetSeconds ??
        null;
    }

    if (offsetSeconds === null && segment?.timeZoneId) {
      offsetSeconds = this.timeZoneService.getOffsetSecondsForZone(
        segment.timeZoneId,
        startPartsOrig ?? endPartsOrig ?? null
      );
    }

    const baseParts =
      startPartsOrig ??
      endPartsOrig ??
      fallbackParts ??
      this.timeZoneService.extractDateParts(new Date());

    if (!baseParts) {
      throw new InternalServerErrorException('Unable to resolve stop date');
    }

    const startParts: DateParts =
      startPartsOrig ??
      {
        ...baseParts,
        hour: baseParts.hour ?? 0,
        minute: baseParts.minute ?? 0,
        second: baseParts.second ?? 0,
        millisecond: baseParts.millisecond ?? 0
      };

    const startDate = this.timeZoneService.buildDateFromParts(
      startParts,
      offsetSeconds
    );

    let endDate: Date | null;
    if (endPartsOrig) {
      endDate = this.timeZoneService.buildDateFromParts(
        endPartsOrig,
        offsetSeconds
      );
    } else {
      const adjustedEnd: DateParts = {
        ...startParts,
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

    if (endDate && endDate.getTime() < startDate.getTime()) {
      const adjustedEnd: DateParts = {
        ...startParts,
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

    if (segment?.timeZoneId) {
      place.timeZoneId = segment.timeZoneId;
    }
    if (typeof offsetSeconds === 'number') {
      place.timeZoneOffsetSeconds = offsetSeconds;
    }

    return {
      type,
      place,
      startDate,
      endDate,
      comment: this.ensureString(segment?.comment)
    };
  }

  private buildPlace(segment: any) {
    const { lat, lng } = this.resolveCoordinates(segment);

    return {
      type: 'place',
      place: {
        city: this.ensureString(segment?.city),
        state: this.ensureString(segment?.state),
        country: this.ensureString(segment?.country) || 'US',
        postcode: this.ensureString(segment?.postcode),
        county: this.ensureString(segment?.county),
        timeZoneId: segment?.timeZoneId ?? null,
        timeZoneOffsetSeconds: segment?.timeZoneOffsetSeconds ?? null
      },
      location: {
        type: 'Point',
        coordinates: {
          lng,
          lat
        }
      }
    };
  }

  private extractEquipment(equipment: any): { equipmentCodes: string[]; hasHazmat: boolean } {
    if (!equipment || typeof equipment !== 'object') {
      return { equipmentCodes: [], hasHazmat: false };
    }

    const codes = new Set<string>();
    let hasHazmat = false;

    Object.entries(equipment).forEach(([key, value]) => {
      if (key.startsWith('@_')) {
        return;
      }
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
      const code = EQUIPMENT_ALIAS_MAP[normalizedKey] ?? key.toUpperCase();
      if (code) {
        codes.add(code);
      }
      const hazardFlag = (value as any)?.['@_hazmat'];
      if (hazardFlag !== undefined) {
        hasHazmat = hasHazmat || Boolean(hazardFlag === true || hazardFlag === 'true' || hazardFlag === 1 || hazardFlag === '1');
      }
    });

    const rootHazmat = (equipment as any)?.['@_hazmat'];
    if (rootHazmat !== undefined) {
      hasHazmat = hasHazmat || Boolean(rootHazmat === true || rootHazmat === 'true' || rootHazmat === 1 || rootHazmat === '1');
    }

    return { equipmentCodes: Array.from(codes).sort(), hasHazmat };
  }

  private extractCapacity(load: any): string {
    const fullFlag = load?.loadsize?.['@_fullload'];
    if (fullFlag === undefined || fullFlag === null || fullFlag === '') {
      return 'full';
    }
    if (typeof fullFlag === 'boolean') {
      return fullFlag ? 'full' : 'partial';
    }
    if (typeof fullFlag === 'string') {
      return fullFlag.toLowerCase() === 'true' ? 'full' : 'partial';
    }
    if (typeof fullFlag === 'number') {
      return fullFlag === 1 ? 'full' : 'partial';
    }
    return 'full';
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  }

  private ensureString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim();
    }
    return String(value);
  }

  private async ensureSegmentCoordinates(segment: any): Promise<void> {
    if (!segment) {
      return;
    }

    let coords = this.resolveCoordinates(segment);
    const hasCoords = Number.isFinite(coords.lat) && Number.isFinite(coords.lng) && (Math.abs(coords.lat) > 0 || Math.abs(coords.lng) > 0);

    if (!hasCoords) {
      const queryParts = [
        this.ensureString(segment?.city),
        this.ensureString(segment?.state),
        this.ensureString(segment?.country)
      ].filter(Boolean);

      if (queryParts.length) {
        const resolved = await this.fetchCoordinates(queryParts.join(', '));
        if (resolved) {
          this.applyCoordinates(segment, resolved.lat, resolved.lng);
          coords = resolved;
        }
      }
    } else {
      this.applyCoordinates(segment, coords.lat, coords.lng);
    }

    const dateParts =
      this.timeZoneService.extractDateParts(segment?.['date-start']) ??
      this.timeZoneService.extractDateParts(segment?.['date-end']);
    await this.ensureSegmentTimeZone(segment, coords, dateParts);
  }

  private async normalizeNativeStops(stops: any[]): Promise<void> {
    if (!Array.isArray(stops)) {
      return;
    }

    for (const stop of stops) {
      if (!stop?.place) {
        continue;
      }

      if ((stop.startDate instanceof Date || stop.startDate === null) &&
          (stop.endDate instanceof Date || stop.endDate === null)) {
        continue;
      }

      const coords = this.resolveCoordinates(stop.place);
      const startParts =
        this.timeZoneService.extractDateParts(stop.startDate);
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
        this.timeZoneService.extractDateParts(stop.endDate)
      );

      const referenceParts =
        startParts ??
        endParts ??
        this.timeZoneService.extractDateParts(new Date());

      if (!referenceParts) {
        continue;
      }

      const info = await this.timeZoneService.lookup(
        coords.lat,
        coords.lng,
        referenceParts
      );

      const offsetSeconds = info?.offsetSeconds ?? null;

      const normalizedStartParts: DateParts = startParts
        ? { ...startParts }
        : { ...referenceParts, hour: 0, minute: 0, second: 0, millisecond: 0 };

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

      stop.startDate = startDate;
      stop.endDate = endDate;

      if (info) {
        stop.timeZoneId = info.timeZoneId;
        stop.timeZoneOffsetSeconds = info.offsetSeconds;
        if (stop.place && typeof stop.place === 'object') {
          stop.place.timeZoneId = info.timeZoneId;
          stop.place.timeZoneOffsetSeconds = info.offsetSeconds;
        }
      }
    }
  }

  private applyCoordinates(segment: any, lat: number, lng: number): void {
    segment.latitude = lat;
    segment.longitude = lng;

    if (!segment.location || typeof segment.location !== 'object') {
      segment.location = { type: 'Point', coordinates: { lng, lat } };
    } else {
      if (!segment.location.type) {
        segment.location.type = 'Point';
      }

      if (!segment.location.coordinates || typeof segment.location.coordinates !== 'object') {
        segment.location.coordinates = { lng, lat };
      } else {
        segment.location.coordinates.lat = lat;
        segment.location.coordinates.lng = lng;
      }
    }

    segment.geoLocation = this.toMongoPoint(segment.location);

    if (segment.place && typeof segment.place === 'object') {
      if (!segment.place.location || typeof segment.place.location !== 'object') {
        segment.place.location = { type: 'Point', coordinates: { lng, lat } };
      } else {
        if (!segment.place.location.type) {
          segment.place.location.type = 'Point';
        }

        if (!segment.place.location.coordinates || typeof segment.place.location.coordinates !== 'object') {
          segment.place.location.coordinates = { lng, lat };
        } else {
          segment.place.location.coordinates.lat = lat;
          segment.place.location.coordinates.lng = lng;
        }
      }
    }
  }

  private async ensureSegmentTimeZone(
    segment: any,
    coords?: { lat: number; lng: number },
    dateParts?: DateParts | null
  ): Promise<void> {
    if (!segment) {
      return;
    }

    if (
      segment.timeZoneId &&
      typeof segment.timeZoneOffsetSeconds === 'number'
    ) {
      return;
    }

    const resolvedCoords = coords ?? this.resolveCoordinates(segment);
    const lat = resolvedCoords?.lat ?? 0;
    const lng = resolvedCoords?.lng ?? 0;

    const info = await this.timeZoneService.lookup(
      lat,
      lng,
      dateParts ?? null
    );
    if (!info) {
      return;
    }

    this.applyTimeZone(segment, info);
  }

  private applyTimeZone(segment: any, info: { timeZoneId: string; offsetSeconds: number }) {
    segment.timeZoneId = info.timeZoneId;
    segment.timeZoneOffsetSeconds = info.offsetSeconds;

    if (segment.place && typeof segment.place === 'object') {
      segment.place.timeZoneId = info.timeZoneId;
      segment.place.timeZoneOffsetSeconds = info.offsetSeconds;
    }
  }

  private async fetchCoordinates(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!address) {
      return null;
    }

    if (this.geocodeCache.has(address)) {
      return this.geocodeCache.get(address)!;
    }

    const apiKey = process.env.AgmCoreModule;
    if (!apiKey) {
      return null;
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address,
          key: apiKey
        }
      });

      const result = response.data?.results?.[0];
      const location = result?.geometry?.location;
      if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
        return null;
      }

      const coords = { lat: Number(location.lat), lng: Number(location.lng) };
      this.geocodeCache.set(address, coords);
      return coords;
    } catch (error) {
      console.error('[PostBrokerService] Geocode lookup failed', address, error?.message ?? error);
      return null;
    }
  }

  private resolveCoordinates(segment: any): { lat: number; lng: number } {
    const latCandidates = [
      segment?.latitude,
      segment?.location?.coordinates?.latitude,
      segment?.location?.coordinates?.lat,
      segment?.place?.location?.coordinates?.latitude,
      segment?.place?.location?.coordinates?.lat
    ];

    const lngCandidates = [
      segment?.longitude,
      segment?.location?.coordinates?.longitude,
      segment?.location?.coordinates?.lng,
      segment?.place?.location?.coordinates?.longitude,
      segment?.place?.location?.coordinates?.lng
    ];

    const lat = this.firstNumber(latCandidates);
    const lng = this.firstNumber(lngCandidates);

    return {
      lat: lat ?? 0,
      lng: lng ?? 0
    };
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

  private firstNumber(values: any[]): number | null {
    let fallback: number | null = null;
    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }

      const num = Number(value);
      if (!Number.isFinite(num)) {
        continue;
      }

      if (Math.abs(num) > 0) {
        return num;
      }

      if (fallback === null) {
        fallback = num;
      }
    }
    return fallback;
  }

  private buildContactLine(name: string, phone?: string, email?: string): string {
    const parts = [name?.trim(), phone?.trim(), email?.trim()].filter(part => !!part);
    if (!parts.length) {
      return 'Prometheus';
    }
    return parts.join(' | ');
  }

  private getEquipmentsData(value) {
    let values =  [
      {value:["V", "R"],viewValue:'Van / Reefer'},
      {value:['V'], viewValue: 'Van only'},
      {value:['R'],viewValue: 'Reefer'},
      {value:["F"],viewValue:'Flatbed'},
      {value:["S"],viewValue:'Step deck'},
      {value:["P"],viewValue:'Power only'},
      {value:["C"],viewValue:'Tanker'},
      {value:["V", "F"],viewValue:'Van / Flatbed'},
      {value:["V","R","F"],viewValue:'Van / Reefer / Flatbed'}
    ];
    for(let valueData of values){
      if(JSON.stringify(valueData.value) === JSON.stringify(value)){
        return valueData.viewValue
      }
    }
  }

  private triggerAssistantMatch(postId: string, userId: string): void {
    void this.matchingService
      .createAssistantSuggestionForPost("brokerPost", String(postId), String(userId))
      .catch((error) =>
        console.error("[HazmatHero] Broker post assistant match failed", error?.message ?? error)
      );
  }
}
