import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

// Modules
import { PrismaModule } from './common/prisma/prisma.module';
import { MapsModule } from './common/maps/maps.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BodegasModule } from './bodegas/bodegas.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { OrdersModule } from './orders/orders.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadModule } from './common/upload/upload.module';
import { RedisModule } from './common/redis/redis.module';
import { CurrencyModule } from './common/currency/currency.module';
import { WebsocketModule } from './websocket/websocket.module';
import { AddressesModule } from './addresses/addresses.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ReviewsModule } from './reviews/reviews.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Task scheduling
    ScheduleModule.forRoot(),

    // Common modules
    PrismaModule,
    MapsModule,
    RedisModule,
    CurrencyModule,
    UploadModule,
    WebsocketModule,

    // Feature modules
    AuthModule,
    UsersModule,
    BodegasModule,
    ProductsModule,
    CategoriesModule,
    OrdersModule,
    DeliveriesModule,
    PaymentsModule,
    NotificationsModule,
    AddressesModule,
    AdminModule,
    AnalyticsModule,
    PayoutsModule,
    ReviewsModule,
    HealthModule,
  ],
})
export class AppModule {}
