import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ThrottlerModule } from "@nestjs/throttler";
import { StripeModule } from "nestjs-stripe";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { CompanyModule } from "./company/company.module";
import { PaymentController } from "./payments-subscriptions/payments.controller";
import { UserModule } from "./user/user.module";

import { APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ChatbbModule } from "./chatbb/chatbb.module";
import { CountersModule } from "./counters/counters.module";
import { AppGatewayModule } from "./gateway/app.gateway.module";
import { BrainModule } from "./brain/brain.module";
import { HistoryInterceptor } from "./interceptors/history.interceptor";
import { LoadsModule } from "./loads/loads.module";
import { MatchingModule } from "./matching/matching.module";
import { MessagesModule } from "./messages/messages.module";
import { PostBrokerModule } from "./post-broker/post.module";
import { PostCarrierModule } from "./post-carrier/post.module";
import { RoutingModule } from "./routing/routing.module";
import { ExternalConnectorsModule } from "./external-connectors/external-connectors.module";
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const directUri =
          config.get<string>("DB_URI") ||
          config.get<string>("DATABASE_URI");
        const fallbackUri = `mongodb+srv://${process.env.DATABASE_USER}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_CLUSTER_NAME}.mongo.ondigitalocean.com/${process.env.DATABASE_NAME}?tls=true&authSource=admin`;

        return {
        // uri: `mongodb+srv://${process.env.DATABASE_USER}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_CLUSTER_NAME}.e0ojw.mongodb.net/${process.env.DATABASE_NAME}?retryWrites=true&w=majority`,

        uri: directUri || fallbackUri
      };
      },
      inject: [ConfigService],

    }),
    AuthModule,
    UserModule,
    CompanyModule,
    HttpModule,
    PostBrokerModule,
    PostCarrierModule,
    ChatbbModule,
    ScheduleModule,
    CountersModule,
    MessagesModule,
    LoadsModule,
    MatchingModule,
    RoutingModule,
    BrainModule,
    ExternalConnectorsModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 10,
      }
    ]),

    StripeModule.forRoot({
      apiKey: process.env.STRIPE_API_KEY,
      apiVersion: null
    }),

    AppGatewayModule

  ],
  controllers: [AppController, PaymentController],
  providers: [AppService, {
    provide: APP_INTERCEPTOR,
    useClass: HistoryInterceptor,
  }],
  exports: []
})
export class AppModule { }
