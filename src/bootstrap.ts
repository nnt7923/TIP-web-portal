import { ValidationPipe, type Type } from '@nestjs/common';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { createClientApiPolicy } from './common/client-api-policy';

export async function createBackendApp(factory = NestFactory) {
  const app = await factory.create(AppModule);

  // Direct clients use public APIs or JWT-guarded routes. Internal routes still
  // require the server-to-server secret; a bearer header alone never grants access.
  const controllers = [...app.get(ModulesContainer).values()].flatMap(
    (module) =>
      [...module.controllers.values()].flatMap((controller) =>
        controller.metatype ? [controller.metatype as Type<unknown>] : [],
      ),
  );
  const isClientApi = createClientApiPolicy(controllers);
  const originSecret = app.get(ConfigService).get<string>('ORIGIN_SECRET');
  if (originSecret) {
    const expected = Buffer.from(originSecret);
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (isClientApi(request.method, request.path)) return next();
      if (
        request.method === 'OPTIONS' &&
        isClientApi(
          request.get('access-control-request-method') || '',
          request.path,
        )
      )
        return next();
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
