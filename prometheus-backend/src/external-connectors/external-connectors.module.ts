import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CompanySchema } from "../company/schema/company.schema";
import { ExternalConnectorsController } from "./external-connectors.controller";
import { ExternalConnectorsService } from "./external-connectors.service";
import { ExternalOpportunitySchema } from "./schema/external-opportunity.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Company", schema: CompanySchema },
      { name: "externalOpportunity", schema: ExternalOpportunitySchema },
    ]),
  ],
  controllers: [ExternalConnectorsController],
  providers: [ExternalConnectorsService],
  exports: [ExternalConnectorsService],
})
export class ExternalConnectorsModule {}
