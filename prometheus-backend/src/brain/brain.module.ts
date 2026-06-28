import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CompanySchema } from "../company/schema/company.schema";
import { MatchingModule } from "../matching/matching.module";
import { RoutingModule } from "../routing/routing.module";
import { BrainApprovalService } from "./brain-approval.service";
import { BrainEventService } from "./brain-event.service";
import { BrainMemoryService } from "./brain-memory.service";
import { PrometheusBrainController } from "./prometheus-brain.controller";
import { PrometheusBrainService } from "./prometheus-brain.service";
import { PrometheusBrainApprovalSchema } from "./schema/prometheus-brain-approval.schema";
import { PrometheusBrainEventSchema } from "./schema/prometheus-brain-event.schema";
import { PrometheusBrainMemorySchema } from "./schema/prometheus-brain-memory.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Company", schema: CompanySchema },
      { name: "prometheusBrainEvent", schema: PrometheusBrainEventSchema },
      { name: "prometheusBrainApproval", schema: PrometheusBrainApprovalSchema },
      { name: "prometheusBrainMemory", schema: PrometheusBrainMemorySchema },
    ]),
    MatchingModule,
    RoutingModule,
  ],
  controllers: [PrometheusBrainController],
  providers: [
    PrometheusBrainService,
    BrainEventService,
    BrainApprovalService,
    BrainMemoryService,
  ],
  exports: [
    PrometheusBrainService,
    BrainEventService,
    BrainApprovalService,
    BrainMemoryService,
  ],
})
export class BrainModule {}
