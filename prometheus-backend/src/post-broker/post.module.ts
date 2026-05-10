import { forwardRef, Module } from '@nestjs/common';
import { PostBrokerService } from './post.service';
import { MongooseModule } from "@nestjs/mongoose";
import { PostBrokerSchema } from "./schema/post.schema";
import { PostBrokerController } from "./post.controller";
import { SharedModule } from "src/shared/shared.module";
import { CompanySchema } from 'src/company/schema/company.schema';
import { PostCarrierModule } from 'src/post-carrier/post.module';
import { AppGatewayModule } from 'src/gateway/app.gateway.module';
import { watchlistBrokerSchema } from './schema/watchlist.schema';
import { UserSchema } from 'src/user/schema/user.schema';
import { notesBrokerSchema } from './schema/notes.schema';
import { MessagesSchema } from 'src/messages/schema/messages.schema';
import { MatchingModule } from 'src/matching/matching.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "brokerPost", schema: PostBrokerSchema },
      { name: "Company", schema: CompanySchema },
      { name: "User", schema: UserSchema },
      { name: "watchlistBroker", schema: watchlistBrokerSchema },
      { name: "notesBroker", schema: notesBrokerSchema },
      { name: "messages", schema: MessagesSchema }
    ]), 
    SharedModule,  
    forwardRef(() => PostCarrierModule),
    forwardRef(() => MatchingModule),
    AppGatewayModule
  ],
  controllers: [PostBrokerController],
  providers: [PostBrokerService],
  exports: [PostBrokerService]
  })
export class PostBrokerModule {
}
