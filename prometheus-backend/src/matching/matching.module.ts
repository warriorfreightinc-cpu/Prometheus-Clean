import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppGatewayModule } from "src/gateway/app.gateway.module";
import { MessagesModule } from "src/messages/messages.module";
import { PostBrokerModule } from "src/post-broker/post.module";
import { PostBrokerSchema } from "src/post-broker/schema/post.schema";
import { PostCarrierModule } from "src/post-carrier/post.module";
import { PostCarrierSchema } from "src/post-carrier/schema/post.schema";
import { RoutingModule } from "src/routing/routing.module";
import { MatchingController } from "./matching.controller";
import { MatchingAssistantService } from "./matching-assistant.service";
import { MatchingService } from "./matching.service";
import { MatchOpportunitySchema } from "./schema/match-opportunity.schema";
import { MatchSnapshotSchema } from "./schema/match-snapshot.schema";
import { MatchingAssistantEventSchema } from "./schema/matching-assistant-event.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "matchSnapshot", schema: MatchSnapshotSchema },
      { name: "matchOpportunity", schema: MatchOpportunitySchema },
      { name: "matchingAssistantEvent", schema: MatchingAssistantEventSchema },
      { name: "brokerPost", schema: PostBrokerSchema },
      { name: "carrierPost", schema: PostCarrierSchema },
    ]),
    RoutingModule,
    MessagesModule,
    AppGatewayModule,
    forwardRef(() => PostBrokerModule),
    forwardRef(() => PostCarrierModule),
  ],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingAssistantService],
  exports: [MatchingService, MatchingAssistantService],
})
export class MatchingModule {}
