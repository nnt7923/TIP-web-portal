import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../redis/redis.service';

export type NotificationChange = {
  eventId: string;
  reason: 'created' | 'read' | 'read-all';
  emittedAt: string;
};
export type NotificationSignal = NotificationChange & { recipients: string[] };

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}
  get enabled() {
    return this.config.get<boolean>('NOTIFICATIONS_REALTIME_ENABLED', false);
  }
  get prefix() {
    return `tip:notifications:${this.config.get<string>('NOTIFICATIONS_REALTIME_NAMESPACE', 'local')}`;
  }
  get channel() {
    return `${this.prefix}:changed`;
  }

  /** Best effort invalidation. The committed database remains the source of truth. */
  async publish(recipients: string[], reason: NotificationChange['reason']) {
    if (!this.enabled || !recipients.length) return;
    try {
      // Bound each message and keep recipient identifiers off the public socket frame.
      for (let i = 0; i < recipients.length; i += 500) {
        const message: NotificationSignal = {
          eventId: randomUUID(),
          reason,
          emittedAt: new Date().toISOString(),
          recipients: recipients.slice(i, i + 500),
        };
        await this.redis.connection.publish(
          this.channel,
          JSON.stringify(message),
        );
      }
    } catch {
      this.logger.warn(
        JSON.stringify({
          event: 'notification_publish_failed',
          reason,
          recipients: recipients.length,
        }),
      );
    }
  }
}
