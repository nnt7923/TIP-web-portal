import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

export async function createBackendApp() {
  const app = await NestFactory.create(AppModule);

  // Render's native Node entry has the same server-to-server protection as Neon.
  // Health checks remain accessible to the hosting platform.
  const originSecret = app.get(ConfigService).get<string>('ORIGIN_SECRET');
  if (originSecret) {
    const expected = Buffer.from(originSecret);
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.method === 'GET' && request.path === '/health') return next();
      const supplied = request.get('x-secret');
      const actual = Buffer.from(supplied || '');
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        response.status(401).json({ message: 'Unauthorized' });
        return;
      }
      next();
    });
  }

  app.enableCors();
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TIP Web Portal API')
    .setDescription('API documentation for TIP Web Portal')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, swaggerDocument, {
    customSiteTitle: 'TIP Web Portal API',
    swaggerOptions: { persistAuthorization: true },
  });

  return app;
}
