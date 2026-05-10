import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MongooseModule } from "@nestjs/mongoose";
import { PassportModule } from "@nestjs/passport";

import { ConfigService } from "@nestjs/config";
import { CompanySchema } from "src/company/schema/company.schema";
import { UserSchema } from "../user/schema/user.schema";
import { AuthController } from "./auth.controller";
import { JwtAuthGuardSocket } from "./auth.guard.socket";
import { AuthService } from "./auth.service";
import { JwtSocketStrategy } from "./jwt-socket-strategy";
import { JwtStrategy } from "./jwt-strategy";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "User", schema: UserSchema },  { name: "Company", schema: CompanySchema }]),
    PassportModule.register({ defaultStrategy: "jwt" }),
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
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy,JwtSocketStrategy,JwtAuthGuardSocket],
  exports: [JwtModule]
})
export class AuthModule {}
