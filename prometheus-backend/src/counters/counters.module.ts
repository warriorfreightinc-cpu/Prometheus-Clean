import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { countersService } from "./counter.service";
import { CountersController } from "./counters.controller";
import { CountersSchema } from "./schema/counters.schema";

@Module({
  imports: [MongooseModule.forFeature([{ name: "Counters", schema: CountersSchema }])],
  controllers: [CountersController],
  providers: [countersService],
  exports: [countersService]
})
export class CountersModule {}
