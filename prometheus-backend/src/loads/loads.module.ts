import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CompanySchema } from "src/company/schema/company.schema";
import { MessagesSchema } from "src/messages/schema/messages.schema";
import { PostBrokerSchema } from "src/post-broker/schema/post.schema";
import { PostCarrierSchema } from "src/post-carrier/schema/post.schema";
import { UserSchema } from "src/user/schema/user.schema";
import { LoadsController } from "./loads.controller";
import { PrometheusLoadSchema } from "./schema/load.schema";
import { LoadsService } from "./loads.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "prometheusLoad", schema: PrometheusLoadSchema },
      { name: "Messages", schema: MessagesSchema },
      { name: "brokerPost", schema: PostBrokerSchema },
      { name: "carrierPost", schema: PostCarrierSchema },
      { name: "User", schema: UserSchema },
      { name: "Company", schema: CompanySchema },
    ]),
  ],
  controllers: [LoadsController],
  providers: [LoadsService],
  exports: [LoadsService],
})
export class LoadsModule {}
