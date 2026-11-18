import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AppConfigService } from './infrastructure/config/app-config.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  app.setGlobalPrefix(config.apiPrefix);
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Project Sol (SolTransit) — Central Transport Core API')
    .setDescription(
      'Unified REST & Real-Time Enterprise Employee Transportation Management API (/api/v1)',
    )
    .setVersion('0.1.0')
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Dev-User-Id', description: 'Dev mode User UUID' },
      'dev-user-id',
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Dev-Org-Id', description: 'Dev mode Org UUID' },
      'dev-org-id',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.port, config.host);
}

await bootstrap();
