import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PostBrokerService } from "src/post-broker/post.service";
import { PostCarrierService } from "src/post-carrier/post.service";
import { RoutingLocation } from "src/routing/interfaces/routing-provider.interface";
import { RoutingService } from "src/routing/routing.service";
import { classifyHazmatCandidate } from "./hazmat-match-classifier";
import { MatchOpportunity } from "./interface/match-opportunity.interface";
import {
  MatchCandidate,
  MatchSnapshot,
  MatchSourcePostType,
  MatchSourceSummary,
} from "./interface/match-snapshot.interface";
import { MatchingAssistantService } from "./matching-assistant.service";

@Injectable()
export class MatchingService {
  constructor(
    @InjectModel("matchSnapshot")
    private readonly snapshotModel: Model<MatchSnapshot>,
    @InjectModel("matchOpportunity")
    private readonly opportunityModel: Model<MatchOpportunity>,
    @InjectModel("brokerPost")
    private readonly brokerPostModel: Model<any>,
    @InjectModel("carrierPost")
    private readonly carrierPostModel: Model<any>,
    @Inject(forwardRef(() => PostBrokerService))
    private readonly brokerService: PostBrokerService,
    @Inject(forwardRef(() => PostCarrierService))
    private readonly carrierService: PostCarrierService,
    private readonly routingService: RoutingService,
    private readonly assistantService: MatchingAssistantService
  ) {}

  async createSnapshotForCarrierPost(
    sourcePostId: string,
    userId: string
  ): Promise<MatchSnapshot> {
    const sourcePost = await this.carrierPostModel.findById(sourcePostId).lean<any>();
    if (!sourcePost) {
      throw new NotFoundException("Carrier post was not found.");
    }

    try {
      const searchablePost = this.toSearchPayload(sourcePost);
      const rawMatches = await this.brokerService.search(searchablePost, userId);
      return await this.persistSnapshot(
        "carrierPost",
        searchablePost,
        userId,
        rawMatches.map((match: any) => ({ ...match, _matchType: "brokerPost" }))
      );
    } catch (error) {
      throw new InternalServerErrorException(error?.message ?? "Prometheus could not build the carrier snapshot.");
    }
  }

  async createSnapshotForBrokerPost(
    sourcePostId: string,
    userId: string
  ): Promise<MatchSnapshot> {
    const sourcePost = await this.brokerPostModel.findById(sourcePostId).lean<any>();
    if (!sourcePost) {
      throw new NotFoundException("Broker post was not found.");
    }

    try {
      const rawMatches = await this.carrierService.search(sourcePost, userId);
      return await this.persistSnapshot(
        "brokerPost",
        sourcePost,
        userId,
        rawMatches.map((match: any) => ({ ...match, _matchType: "carrierPost" }))
      );
    } catch (error) {
      throw new InternalServerErrorException(error?.message ?? "Prometheus could not build the broker snapshot.");
    }
  }

  async getLatestSnapshot(
    sourcePostType: MatchSourcePostType,
    sourcePostId: string
  ): Promise<MatchSnapshot | null> {
    return this.snapshotModel
      .findOne({ sourcePostType, sourcePostId: String(sourcePostId) })
      .sort({ createdAt: -1 })
      .lean<any>();
  }

  async createAssistantSuggestionForPost(
    sourcePostType: MatchSourcePostType,
    sourcePostId: string,
    userId: string
  ): Promise<MatchSnapshot> {
    const snapshot =
      sourcePostType === "brokerPost"
        ? await this.createSnapshotForBrokerPost(sourcePostId, userId)
        : await this.createSnapshotForCarrierPost(sourcePostId, userId);

    await this.assistantService.createSourceSuggestion(
      snapshot.companyId,
      userId,
      sourcePostId
    );
    const opportunities = await this.findRankedOpportunities(
      snapshot.companyId,
      sourcePostId
    );
    await this.assistantService.createCounterpartSuggestions(opportunities);

    return snapshot;
  }

  private async findRankedOpportunities(companyId: string, sourcePostId: string) {
    return this.opportunityModel
      .find({ companyId, sourcePostId, status: { $in: ["suggested", "negotiating"] } })
      .sort({ tierRank: 1, score: -1, updatedAt: -1 })
      .limit(5)
      .lean<any>();
  }

  private async persistSnapshot(
    sourcePostType: MatchSourcePostType,
    sourcePost: any,
    userId: string,
    rawMatches: any[]
  ): Promise<MatchSnapshot> {
    const sourceSummary = this.buildSourceSummary(sourcePost);
    const candidates = await Promise.all(
      rawMatches.slice(0, 25).map((match) =>
        this.buildCandidate(sourcePostType, sourcePost, match)
      )
    );
    const sortedCandidates = candidates.sort((left, right) => {
      const tierDifference = this.tierRank(left.tier) - this.tierRank(right.tier);
      return tierDifference !== 0 ? tierDifference : right.score - left.score;
    });

    await this.persistOpportunities(sourcePostType, sourcePost, sortedCandidates);

    const document = await this.snapshotModel.create({
      companyId: String(sourcePost.companyId ?? ""),
      sourcePostId: String(sourcePost._id),
      sourcePostType,
      generatedByUserId: String(userId),
      provider: this.routingService.providerName,
      status: "ready",
      candidateCount: sortedCandidates.length,
      sourceSummary,
      candidates: sortedCandidates,
    });

    return document.toObject() as MatchSnapshot;
  }

  private async persistOpportunities(
    sourcePostType: MatchSourcePostType,
    sourcePost: any,
    candidates: MatchCandidate[]
  ): Promise<void> {
    await Promise.all(
      candidates.map((candidate) =>
        this.opportunityModel.findOneAndUpdate(
          {
            sourcePostType,
            sourcePostId: String(sourcePost._id),
            candidatePostType: candidate.matchPostType,
            candidatePostId: candidate.matchPostId,
          },
          {
            $set: {
              companyId: String(sourcePost.companyId ?? ""),
              sourceCompanyId: String(sourcePost.companyId ?? ""),
              candidateCompanyId: candidate.summary.companyId,
              sourcePublisherId: this.cleanString(sourcePost.publisherId) || undefined,
              candidatePublisherId: candidate.summary.publisherId,
              tier: candidate.tier,
              tierRank: this.tierRank(candidate.tier),
              score: candidate.score,
              hazmatCompatible: candidate.hazmatCompatible,
              equipmentCompatibility: candidate.equipmentCompatibility,
              permissionQuestion: candidate.permissionQuestion,
              reasonCodes: candidate.reasonCodes,
            },
            $setOnInsert: {
              status: "suggested",
              permissionStatus: candidate.permissionStatus,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );
  }

  private buildSourceSummary(sourcePost: any): MatchSourceSummary {
    return {
      companyId: String(sourcePost.companyId ?? ""),
      publisherId: this.cleanString(sourcePost.publisherId) || undefined,
      lane: {
        origin: this.formatLocation(sourcePost.origin),
        destination: this.formatLocation(sourcePost.destination),
      },
      equipment: this.normalizeEquipment(sourcePost.equipment),
      weight: this.toNumber(sourcePost.weight),
      rate: this.toNumber(sourcePost.rate),
      publishedAt: this.toDateOrNull(sourcePost.publishedAt),
      availabilityStart: this.toDateOrNull(
        sourcePost.startDate ?? sourcePost.stops?.[0]?.startDate
      ),
      availabilityEnd: this.toDateOrNull(
        sourcePost.endDate ??
          sourcePost.stops?.[sourcePost.stops?.length - 1]?.endDate ??
          sourcePost.stops?.[0]?.endDate
      ),
      dhoRadius: this.toNumber(sourcePost.dhoRadius),
      dhdRadius: this.toNumber(sourcePost.dhdRadius),
      reference:
        this.cleanString(sourcePost.refNum) ||
        this.cleanString(sourcePost.loadNumber) ||
        this.cleanString(sourcePost.reference),
    };
  }

  private async buildCandidate(
    sourcePostType: MatchSourcePostType,
    sourcePost: any,
    match: any
  ): Promise<MatchCandidate> {
    const sourceOrigin = this.extractPoint(sourcePost.origin);
    const sourceDestination = this.extractPoint(sourcePost.destination);
    const matchOrigin = this.extractPoint(match.origin);
    const matchDestination = this.extractPoint(match.destination);

    const tripRoute =
      matchOrigin && matchDestination
        ? await this.routingService.getRouteReport({
            origin: matchOrigin,
            destination: matchDestination,
            vehicleProfile: {
              equipment: this.normalizeEquipment(match.equipment),
              weightLbs: this.toNumber(match.weight),
            },
          })
        : null;

    const originDeadheadMiles =
      this.toNumber(match.dho) ??
      (sourceOrigin && matchOrigin
        ? (await this.routingService.getRouteReport({
            origin: sourceOrigin,
            destination: matchOrigin,
          }))?.distanceMiles ?? null
        : null);

    const destinationDeadheadMiles =
      this.toNumber(match.dhd) ??
      (sourceDestination && matchDestination
        ? (await this.routingService.getRouteReport({
            origin: matchDestination,
            destination: sourceDestination,
          }))?.distanceMiles ?? null
        : null);

    const tripMiles = this.toNumber(match.distance) ?? tripRoute?.distanceMiles ?? null;
    const totalPracticalMiles =
      originDeadheadMiles !== null || tripMiles !== null
        ? (originDeadheadMiles ?? 0) + (tripMiles ?? 0)
        : null;
    const estimatedDriveMinutes =
      totalPracticalMiles !== null
        ? Math.max(Math.round((totalPracticalMiles / 47) * 60), 0)
        : tripRoute?.driveMinutes ?? null;

    const scoreBreakdown = this.buildScoreBreakdown(
      sourcePostType,
      sourcePost,
      match,
      originDeadheadMiles,
      destinationDeadheadMiles,
      totalPracticalMiles
    );

    const score = this.roundScore(
      scoreBreakdown.laneFit * 0.35 +
        scoreBreakdown.equipmentFit * 0.2 +
        scoreBreakdown.weightFit * 0.15 +
        scoreBreakdown.freshnessFit * 0.15 +
        scoreBreakdown.rateFit * 0.15
    );
    const decision = classifyHazmatCandidate({
      sourcePostType,
      sourceEquipment: sourcePost.equipment,
      candidateEquipment: match.equipment,
      sourceWeight: this.toNumber(sourcePost.weight),
      candidateWeight: this.toNumber(match.weight),
      sourceNonHazmat: Boolean(sourcePost.nonHazmat),
      candidateNonHazmat: Boolean(match.nonHazmat),
    });

    return {
      matchPostId: String(match._id ?? ""),
      matchPostType: match._matchType,
      score,
      tier: decision.tier,
      hazmatCompatible: decision.hazmatCompatible,
      equipmentCompatibility: decision.equipmentCompatibility,
      permissionStatus: decision.permissionStatus,
      permissionQuestion: decision.permissionQuestion,
      reasonCodes: decision.reasonCodes,
      scoreBreakdown,
      summary: {
        companyId: String(match.companyId ?? ""),
        publisherId: this.cleanString(match.publisherId) || undefined,
        lane: {
          origin: this.formatLocation(match.origin),
          destination: this.formatLocation(match.destination),
        },
        equipment: this.normalizeEquipment(match.equipment),
        weight: this.toNumber(match.weight),
        rate: this.toNumber(match.rate),
        publishedAt: this.toDateOrNull(match.publishedAt),
        reference:
          this.cleanString(match.refNum) ||
          this.cleanString(match.loadNumber) ||
          this.cleanString(match.reference),
      },
      routeMetrics: {
        originDeadheadMiles,
        destinationDeadheadMiles,
        tripMiles,
        totalPracticalMiles,
        estimatedDriveMinutes,
        provider:
          tripRoute?.provider ??
          (originDeadheadMiles !== null || destinationDeadheadMiles !== null
            ? this.routingService.providerName
            : null),
      },
    };
  }

  private buildScoreBreakdown(
    sourcePostType: MatchSourcePostType,
    sourcePost: any,
    match: any,
    originDeadheadMiles: number | null,
    destinationDeadheadMiles: number | null,
    totalPracticalMiles: number | null
  ) {
    const sourceEquipment = this.normalizeEquipment(sourcePost.equipment);
    const matchEquipment = this.normalizeEquipment(match.equipment);
    const sharedEquipment = sourceEquipment.filter((item) => matchEquipment.includes(item));

    const equipmentFit = sourceEquipment.length
      ? sharedEquipment.length / sourceEquipment.length
      : matchEquipment.length
        ? 1
        : 0;

    const sourceWeight = this.toNumber(sourcePost.weight);
    const matchWeight = this.toNumber(match.weight);
    const weightFit =
      sourcePostType === "carrierPost"
        ? this.carrierWeightFit(sourceWeight, matchWeight)
        : this.brokerWeightFit(sourceWeight, matchWeight);

    const freshnessFit = this.calculateFreshnessFit(match.publishedAt);

    const laneFromOrigin = this.radiusFit(
      originDeadheadMiles,
      this.toNumber(sourcePost.dhoRadius)
    );
    const laneFromDestination = this.radiusFit(
      destinationDeadheadMiles,
      this.toNumber(sourcePost.dhdRadius)
    );
    const laneFit = this.roundScore((laneFromOrigin * 0.7) + (laneFromDestination * 0.3));

    const rateFit = this.calculateRateFit(this.toNumber(match.rate), totalPracticalMiles);

    return {
      laneFit,
      equipmentFit: this.roundScore(equipmentFit),
      weightFit,
      freshnessFit,
      rateFit,
    };
  }

  private carrierWeightFit(
    sourceWeight: number | null,
    matchWeight: number | null
  ): number {
    if (sourceWeight === null || matchWeight === null) {
      return 0.5;
    }
    if (matchWeight > sourceWeight) {
      return 0;
    }
    return this.roundScore(1 - ((sourceWeight - matchWeight) / Math.max(sourceWeight, 1)) * 0.15);
  }

  private brokerWeightFit(
    sourceWeight: number | null,
    matchWeight: number | null
  ): number {
    if (sourceWeight === null || matchWeight === null) {
      return 0.5;
    }
    if (matchWeight < sourceWeight) {
      return 0;
    }
    return this.roundScore(1 - ((matchWeight - sourceWeight) / Math.max(matchWeight, 1)) * 0.15);
  }

  private calculateFreshnessFit(value: any): number {
    const publishedAt = this.toDateOrNull(value);
    if (!publishedAt) {
      return 0.3;
    }

    const ageHours = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours <= 0) {
      return 1;
    }
    if (ageHours >= 20) {
      return 0;
    }
    return this.roundScore(1 - ageHours / 20);
  }

  private calculateRateFit(
    rate: number | null,
    totalPracticalMiles: number | null
  ): number {
    if (rate === null) {
      return 0.25;
    }
    if (!totalPracticalMiles || totalPracticalMiles <= 0) {
      return 0.55;
    }

    const rpm = rate / totalPracticalMiles;
    if (!Number.isFinite(rpm)) {
      return 0.25;
    }

    return this.roundScore(Math.max(Math.min((rpm - 1) / 2, 1), 0));
  }

  private radiusFit(distanceMiles: number | null, radiusMiles: number | null): number {
    if (distanceMiles === null) {
      return 0.25;
    }
    if (!radiusMiles || radiusMiles <= 0) {
      return distanceMiles === 0 ? 1 : 0.5;
    }
    return this.roundScore(Math.max(1 - distanceMiles / radiusMiles, 0));
  }

  private extractPoint(segment: any): RoutingLocation | null {
    const lat = Number(
      segment?.location?.coordinates?.lat ??
        segment?.location?.coordinates?.latitude ??
        segment?.location?.coordinates?.[1]
    );
    const lng = Number(
      segment?.location?.coordinates?.lng ??
        segment?.location?.coordinates?.longitude ??
        segment?.location?.coordinates?.[0]
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      lat,
      lng,
      label: this.formatLocation(segment),
    };
  }

  private formatLocation(location: any): string {
    if (!location) {
      return "";
    }
    if (location.type === "place" && location.place) {
      if (typeof location.place === "string") {
        return location.place;
      }
      return [location.place.city, location.place.state].filter(Boolean).join(", ");
    }
    if (Array.isArray(location.states) && location.states.length) {
      return location.states.join(", ");
    }
    if (Array.isArray(location.zones) && location.zones.length) {
      return location.zones.map((zone: any) => zone?.zone).filter(Boolean).join(", ");
    }
    return "";
  }

  private normalizeEquipment(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this.cleanString(item))
      .filter(Boolean);
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toDateOrNull(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private cleanString(value: unknown): string {
    return String(value ?? "").trim();
  }

  private roundScore(value: number): number {
    return Math.round(Math.max(Math.min(value, 1), 0) * 100) / 100;
  }

  private tierRank(tier: string): number {
    const tierOrder: Record<string, number> = {
      strictHazmat: 0,
      hazmatNearMatch: 1,
      hazmatPermission: 2,
      hazmatMarketAlternative: 3,
      nonHazmatFallback: 4,
    };
    return tierOrder[tier] ?? 99;
  }

  private toSearchPayload(post: any): any {
    return JSON.parse(JSON.stringify(post ?? {}));
  }
}
