import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationEventsService } from './notification-events.service';

// No AuthModule dependency: AuthService also publishes notifications.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventsService],
  exports: [NotificationsService, NotificationEventsService],
})
export class NotificationsModule {}
