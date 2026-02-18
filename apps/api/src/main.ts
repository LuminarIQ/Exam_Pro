import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { StructuredLogger } from './common/structured-logger';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import * as cookieParser from 'cookie-parser';
import * as helmet from 'helmet';
import { MetricsService } from './observability/metrics.service';
import { shutdownTracing, startTracing } from './observability/tracing';

async function bootstrap() {
  await startTracing();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(StructuredLogger);
  const metrics = app.get(MetricsService);
  app.useLogger(logger);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet.default ? helmet.default() : (helmet as any)());
  app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'cookie-secret'));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(logger, metrics));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-correlation-id'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Adaptive Tutor API')
    .setDescription('MVP API docs')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT || 3000);
  app.enableShutdownHooks();
  process.on('SIGTERM', () => {
    void shutdownTracing();
  });
  process.on('SIGINT', () => {
    void shutdownTracing();
  });
  await app.listen(port);
}

bootstrap();
