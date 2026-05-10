import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { UserSchema } from "./schema/user.schema";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { AuthModule } from "../auth/auth.module";
import { JwtStrategy } from "../auth/jwt-strategy";
import { ConfigService } from "@nestjs/config";
import { CompanySchema } from "src/company/schema/company.schema";
import { EmailExists } from "../shared/validarors/existing-email.validator";
import { AppGatewayModule } from "../gateway/app.gateway.module";


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "User", schema: UserSchema },
      { name: "Company", schema: CompanySchema }
    ]),
  
   
    AuthModule,
    AppGatewayModule
  ],
  controllers: [UserController],
  providers: [UserService, JwtStrategy,EmailExists],
  exports: []
})
export class UserModule {}
