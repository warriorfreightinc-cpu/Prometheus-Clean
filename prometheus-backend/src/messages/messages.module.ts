import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from "@nestjs/mongoose";
import { MessagesController } from "./messages.controller";
import { SharedModule } from "src/shared/shared.module";
import { CompanySchema } from 'src/company/schema/company.schema';
import { AppGatewayModule } from 'src/gateway/app.gateway.module';
import { UserSchema } from 'src/user/schema/user.schema';
import { MessagesSchema } from './schema/messages.schema';
import { MessagesService } from './messages.service';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Company", schema: CompanySchema },
      { name: "User", schema: UserSchema },
      { name: "Messages", schema: MessagesSchema }
    ]), 
    SharedModule,  
    forwardRef(() => MessagesModule),
    AppGatewayModule
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService]
  })
export class MessagesModule {
}

