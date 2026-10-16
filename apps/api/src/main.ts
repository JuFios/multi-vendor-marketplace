import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG, type AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const { port } = app.get<AppConfig>(APP_CONFIG).http;
  await app.listen(port);
  new Logger('Bootstrap').log(`api listening on port ${port}`);
}

void bootstrap();
