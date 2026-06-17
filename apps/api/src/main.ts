import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ─── Security ────────────────────────────────────────────────
  app.use(helmet());
  app.use(compression());

  // ─── CORS ────────────────────────────────────────────────────
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ─── Global Prefix ───────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ─── Validation Pipe ─────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── WebSocket Adapter ───────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ─── Swagger API Docs ─────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ALOS API')
      .setDescription('Adaptive Learning Operating System — REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('tracker', 'Learning tracker endpoints')
      .addTag('graph', 'Knowledge graph endpoints')
      .addTag('mastery', 'Concept mastery endpoints')
      .addTag('questions', 'Question bank endpoints')
      .addTag('analytics', 'Analytics & dashboard endpoints')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger docs: http://localhost:3001/api/docs');
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`🚀 ALOS API running on: http://localhost:${port}/api`);
  logger.log(`📡 WebSocket ready on: ws://localhost:${port}`);
}

bootstrap();
