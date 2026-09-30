import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createBackendApp } from './bootstrap';

async function bootstrap() {
  const app = await createBackendApp(NestFactory);
  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
