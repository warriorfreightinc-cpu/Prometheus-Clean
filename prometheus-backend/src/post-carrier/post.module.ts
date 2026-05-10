import { forwardRef, Module } from '@nestjs/common';
import { PostCarrierService } from './post.service';
import { MongooseModule } from "@nestjs/mongoose";
import { PostCarrierSchema } from "./schema/post.schema";
import { PostCarrierController } from "./post.controller";
import { SharedModule } from "src/shared/shared.module";
import { CompanySchema } from 'src/company/schema/company.schema';
import { PostBrokerModule } from 'src/post-broker/post.module';
import { AppGatewayModule } from 'src/gateway/app.gateway.module';
import { watchlistCarrierSchema } from './schema/watchlist.schema';
import { UserSchema } from 'src/user/schema/user.schema';
import { notesCarrierSchema } from './schema/notes.schema';
import { MessagesSchema } from 'src/messages/schema/messages.schema';
import { MatchingModule } from 'src/matching/matching.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "carrierPost", schema: PostCarrierSchema },
      { name: "Company", schema: CompanySchema },
      { name: "User", schema: UserSchema },
      { name: "watchlistCarrier", schema: watchlistCarrierSchema },
      { name: "notesCarrier", schema: notesCarrierSchema },
      { name: "messages", schema: MessagesSchema }
    ]), 
    SharedModule,  
    forwardRef(() => PostBrokerModule),
    forwardRef(() => MatchingModule),
    AppGatewayModule
  ],
  controllers: [PostCarrierController],
  providers: [PostCarrierService],
  exports: [PostCarrierService]
  })
export class PostCarrierModule {
}
