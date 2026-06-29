import { ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from 'body-parser';
import { useContainer } from "class-validator";
import { join } from "path";
import { AppModule } from "./app.module";
import { JwtAuthGuard } from "./auth/auth.guard";
import { resolveRuntimePort } from "./config/runtime-port";
import { ClusterIOAdapter } from "./gateway/cluster-adapter";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const reflector = app.get(Reflector);
  app.use('/subscriptions/stripe_webhooks', bodyParser.raw({type: 'application/json'}));
  app.use(
    '/loadboardnetwork',
    bodyParser.raw({
      type: ['application/xml', 'text/xml', 'application/*+xml'],
      //limit: '1mb',
    }),
  );
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
  app.useGlobalGuards(new JwtAuthGuard(reflector));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableCors();


  const clusterAdapter = new ClusterIOAdapter(app);
  app.useWebSocketAdapter(clusterAdapter);

  const options = new DocumentBuilder().setTitle("PROMETHEUS BACKEND").setVersion("1.0").addTag("login").addBearerAuth({ type: "http" }, "bearer").build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup("api", app, document);

  app.useStaticAssets(join(__dirname, "..", "files"), {
    prefix: "/files"
  });

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  await app.listen(resolveRuntimePort());
}

async function main() {
  await bootstrap();
}

main();
