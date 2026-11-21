import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // behind Caddy/Nginx: take the phone's IP from X-Forwarded-For, so rate limits are per user
  app.set('trust proxy', 'loopback');
  configureApp(app);

  const configService = app.get(ConfigService<AppConfig, true>);
  await app.listen(configService.get('port', { infer: true }));
}
void bootstrap();
