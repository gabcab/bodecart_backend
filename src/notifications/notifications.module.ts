import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { MapsModule } from '../common/maps/maps.module';

@Module({
  imports: [PrismaModule, WebsocketModule, MapsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
