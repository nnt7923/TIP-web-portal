import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationEventsService } from './notification-events.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationTicketService } from './notification-ticket.service';
import { NotificationsGateway } from './notifications.gateway';

// No AuthModule dependency: AuthService also publishes notifications.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventsService,
    NotificationDeliveryService,
    NotificationTicketService,
    NotificationsGateway,
  ],
  exports: [
    NotificationsService,
    NotificationEventsService,
    NotificationsGateway,
  ],
})
export class NotificationsModule {}
