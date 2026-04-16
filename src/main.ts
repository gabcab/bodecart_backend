import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });

  // Serve static files from uploads directory
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Increase body parser limits for file uploads
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  // Global prefix (exclude uploads so files are served at /uploads/ not /api/uploads/)
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'uploads/(.*)', method: RequestMethod.GET },
    ],
  });

  // Validation pipe
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

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('BodeCart API')
    .setDescription('BodeCart Backend API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('bodegas', 'Bodega management')
    .addTag('products', 'Product management')
    .addTag('orders', 'Order management')
    .addTag('deliveries', 'Delivery management')
    .addTag('payments', 'Payment processing')
    .addTag('notifications', 'Notification system')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║          🛒 BodeCart API Server                   ║
    ║                                                   ║
    ║  Server running on: http://localhost:${port}       ║
    ║  API Docs: http://localhost:${port}/api/docs      ║
    ║  Environment: ${process.env.NODE_ENV || 'development'}                  ║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
  `);
}

bootstrap();
