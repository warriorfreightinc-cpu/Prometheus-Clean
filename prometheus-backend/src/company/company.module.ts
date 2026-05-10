import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CompanySchema } from "./schema/company.schema";
import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";
import { AuthModule } from "src/auth/auth.module";
import { UserSchema } from "src/user/schema/user.schema";
import { AppGatewayModule } from "src/gateway/app.gateway.module";
import { HistoryInterceptor } from "src/interceptors/history.interceptor";
import { HistorySchema } from "./schema/history.schema";
import { CountersSchema } from "src/counters/schema/counters.schema";
import { OnboardingController } from "./onboarding/onboarding.controller";
import { OnboardingService } from "./onboarding/onboarding.service";
import { CompanySetupController } from "./setup/company-setup.controller";
import { CompanySetupService } from "./setup/company-setup.service";
import { CompanyIntegrationsController } from "./integrations/company-integrations.controller";
import { CompanyIntegrationsService } from "./integrations/company-integrations.service";
import { PostBrokerSchema } from "src/post-broker/schema/post.schema";
import { PostCarrierSchema } from "src/post-carrier/schema/post.schema";
import { CompanyAuthorityValidationService } from "./authority/company-authority-validation.service";


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Company", schema: CompanySchema },
      { name: "History", schema: HistorySchema },
      { name: "User", schema: UserSchema },
      { name: "Counters", schema: CountersSchema },
      { name: "brokerPost", schema: PostBrokerSchema },
      { name: "carrierPost", schema: PostCarrierSchema }
    ]),
    AuthModule,
    AppGatewayModule 
  ],
  controllers: [CompanyController, OnboardingController, CompanySetupController, CompanyIntegrationsController],
  providers: [CompanyService, OnboardingService, CompanySetupService, CompanyIntegrationsService, CompanyAuthorityValidationService],
  exports: [CompanyService, CompanyIntegrationsService]
})
export class CompanyModule {}
