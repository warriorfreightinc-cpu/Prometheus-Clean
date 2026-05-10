import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MessagesSchema } from "src/messages/schema/messages.schema";
import { PostBrokerSchema } from "src/post-broker/schema/post.schema";
import { PostCarrierSchema } from "src/post-carrier/schema/post.schema";
import { SharedModule } from "src/shared/shared.module";
import { ChatbbController } from "./chatbb.controller";
import { ChatbbService } from "./chatbb.service";
import { ChatbbThreadSchema } from "./schema/chatbb-thread.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "ChatbbThread", schema: ChatbbThreadSchema },
      { name: "Messages", schema: MessagesSchema },
      { name: "brokerPost", schema: PostBrokerSchema },
      { name: "carrierPost", schema: PostCarrierSchema }
    ]),
    SharedModule
  ],
  controllers: [ChatbbController],
  providers: [ChatbbService],
  exports: [ChatbbService]
})
export class ChatbbModule {}
