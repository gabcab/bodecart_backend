import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeProvider } from './providers/stripe.provider';
import { PayPalProvider } from './providers/paypal.provider';
import { PrismaModule } from '../common/prisma/prisma.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, WebsocketModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeProvider, PayPalProvider],
  exports: [PaymentsService, StripeProvider],
})
export class PaymentsModule {}
