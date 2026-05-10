import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { AppGateway } from './app.gateway';
@Module({
  imports: [AuthModule],
  providers: [AppGateway],
  exports: [AppGateway]
  })
export class AppGatewayModule {
}
