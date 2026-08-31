import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';

import { AppModule } from './app.module';

type CorsCallback = (error: Error | null, allow?: boolean) => void;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.setGlobalPrefix('api/v1');

  app.use(helmet());

  app.use(compression());

  const isProduction = process.env.NODE_ENV === 'production';

  const frontendUrls =
    process.env.FRONTEND_URL?.split(',')
      .map((url) => url.trim())
      .filter(Boolean) ?? [];

  if (isProduction && frontendUrls.length === 0) {
    throw new Error('FRONTEND_URL must be configured in production.');
  }

  const allowedOrigins =
    frontendUrls.length > 0 ? frontendUrls : ['http://localhost:3000'];

  app.enableCors({
    origin: (origin: string | undefined, callback: CorsCallback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
    },

    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Content-Type', 'Authorization', 'x-memory-session'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,

      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  const port = Number(process.env.PORT) || 4000;

  await app.listen(port, '0.0.0.0');

  console.log(`Aakash Backend API running on port ${port} with prefix /api/v1`);
}

void bootstrap();
