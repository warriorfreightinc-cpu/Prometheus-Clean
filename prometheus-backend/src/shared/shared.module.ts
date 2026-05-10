import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { JwtModule } from "@nestjs/jwt";
import { MongooseModule } from "@nestjs/mongoose";



import { UserSchema } from "../user/schema/user.schema";
import { QueryBuilderService } from "./query-builder.service";
import { EmailExists } from "./validarors/existing-email.validator";
import { TimeZoneService } from "./services/timezone.service";


@Module({
  imports: [
    MongooseModule.forFeature([{ name: "User", schema: UserSchema }]),
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      useFactory: () => {
        return {
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: process.env.JWT_EXPIRATION }
        };
      },
      inject: [ConfigService]
    })
  ],
  controllers: [],
  providers: [
    QueryBuilderService,
    EmailExists,
    TimeZoneService
  ],
  exports: [
    JwtModule,
    MongooseModule.forFeature([{ name: "User", schema: UserSchema }]),
    QueryBuilderService,
    TimeZoneService
  ]
})
export class SharedModule {}
