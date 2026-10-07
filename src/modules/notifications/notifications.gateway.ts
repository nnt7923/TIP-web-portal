import {
  Injectable,
  HttpException,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type Redis from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';
import { RedisService } from '../../redis/redis.service';
import type { JwtPayload } from '../auth/guards/jwt-auth-guard';
import {
  NotificationDeliveryService,
  type NotificationSignal,
} from './notification-delivery.service';
import { NotificationTicketService } from './notification-ticket.service';

type Connection = {
  socket: WebSocket;
  claims?: JwtPayload;
  authenticating: boolean;
  alive: boolean;
  authTimer: NodeJS.Timeout;
  expiryTimer?: NodeJS.Timeout;
  sending: boolean;
  pending?: NotificationSignal;
  validating: boolean;
};

@Injectable()
export class NotificationsGateway implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly sockets = new Map<WebSocket, Connection>();
  private server?: Server;
  private wss?: WebSocketServer;
  private subscriber?: Redis;
  private timer?: NodeJS.Timeout;
  private healthy = false;
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly delivery: NotificationDeliveryService,
    private readonly tickets: NotificationTicketService,
  ) {}

  attach(server: Server) {
    if (!this.delivery.enabled || this.server) return;
    this.server = server;
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 1024,
      perMessageDeflate: false,
    });
    server.on('upgrade', this.upgrade);
    const subscriber = this.redis.connection.duplicate({
      enableOfflineQueue: false,
    });
    this.subscriber = subscriber;
    subscriber.on('ready', () => {
      void subscriber
        .subscribe(this.delivery.channel)
        .then(() => {
          this.healthy = true;
        })
        .catch(() => this.unavailable());
    });
    subscriber.on('error', () => this.unavailable());
    subscriber.on('close', () => this.unavailable());
    subscriber.on('message', (channel, raw) => {
      if (channel !== this.delivery.channel) return;
      try {
        const message = JSON.parse(raw) as NotificationSignal;
        if (
          !Array.isArray(message.recipients) ||
          typeof message.eventId !== 'string' ||
          typeof message.emittedAt !== 'string' ||
          !['created', 'read', 'read-all'].includes(message.reason)
        )
          return;
        const recipients = new Set(message.recipients);
        for (const client of this.sockets.values()) {
          if (client.claims && recipients.has(client.claims.sub)) {
            client.pending = message;
            void this.sendPending(client);
          }
        }
      } catch {
        this.logger.warn('Invalid notification signal');
      }
    });
    this.timer = setInterval(() => {
      for (const client of this.sockets.values()) {
        if (!client.alive) {
          client.socket.terminate();
          continue;
        }
        client.alive = false;
        client.socket.ping();
        if (client.claims && !client.validating) {
          client.validating = true;
          void this.tickets
            .validate(client.claims)
            .catch((error) => this.reject(client, error))
            .finally(() => {
              client.validating = false;
            });
        }
      }
    }, 30000);
    this.timer.unref();
  }

  private readonly upgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    void this.accept(request, socket, head);
  };

  private async accept(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const reject = (status: number) => {
      if (!socket.destroyed)
        socket.end(
          `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
        );
    };
    if (request.url !== '/notifications/ws') {
      reject(404);
      return;
    }
    const origins = this.config
      .get<string>('NOTIFICATIONS_ALLOWED_ORIGINS', '')
      .split(',')
      .map((s) => s.trim());
    if (!request.headers.origin || !origins.includes(request.headers.origin)) {
      reject(403);
      return;
    }
    if (!this.healthy || this.sockets.size >= 1000) {
      reject(503);
      return;
    }
    const forwarded = request.headers['x-forwarded-for'];
    const ip =
      process.env.VERCEL === '1' &&
      typeof forwarded === 'string' &&
      isIP(forwarded)
        ? forwarded
        : (request.socket.remoteAddress ?? 'unknown');
    try {
      await this.tickets.rateLimit('handshake', ip, 120);
      if (socket.destroyed) return;
      this.wss!.handleUpgrade(request, socket, head, (ws) =>
        this.connected(ws),
      );
    } catch (error) {
      reject(
        error instanceof HttpException && error.getStatus() === 429 ? 429 : 503,
      );
    }
  }

  private connected(socket: WebSocket) {
    const client: Connection = {
      socket,
      authenticating: false,
      alive: true,
      sending: false,
      validating: false,
      authTimer: setTimeout(
        () => socket.close(4401, 'Authentication required'),
        5000,
      ),
    };
    this.sockets.set(socket, client);
    socket.on('error', () =>
      this.logger.debug('Notification socket closed after a transport error'),
    );
    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('close', () => {
      clearTimeout(client.authTimer);
      clearTimeout(client.expiryTimer);
      this.sockets.delete(socket);
    });
    socket.on('message', (raw, binary) => {
      if (binary || client.claims || client.authenticating) {
        socket.close(4400, 'Unexpected frame');
        return;
      }
      client.authenticating = true;
      void (async () => {
        const frame = JSON.parse(
          (Array.isArray(raw)
            ? Buffer.concat(raw)
            : Buffer.from(raw as ArrayBuffer)
          ).toString('utf8'),
        ) as {
          type?: string;
          ticket?: unknown;
        };
        if (frame.type !== 'authenticate') throw new UnauthorizedException();
        const claims = await this.tickets.consume(frame.ticket);
        if (socket.readyState !== WebSocket.OPEN) return;
        if (!this.healthy) {
          socket.close(1013, 'Temporarily unavailable');
          return;
        }
        client.claims = claims;
        clearTimeout(client.authTimer);
        client.expiryTimer = setTimeout(
          () => socket.close(4401, 'Refresh authentication'),
          Math.max(1, claims.exp! * 1000 - Date.now()),
        );
        socket.send(JSON.stringify({ type: 'notifications.ready' }));
        this.logger.log(
          JSON.stringify({
            event: 'notification_socket_authenticated',
            connections: this.sockets.size,
          }),
        );
      })().catch((error) => this.reject(client, error));
    });
  }

  private async sendPending(client: Connection) {
    if (client.sending) return;
    client.sending = true;
    try {
      while (
        client.pending &&
        client.claims &&
        client.socket.readyState === WebSocket.OPEN
      ) {
        const signal = client.pending;
        client.pending = undefined;
        await this.tickets.validate(client.claims);
        if (client.socket.readyState !== WebSocket.OPEN) return;
        if (!this.healthy || client.socket.bufferedAmount > 65536) {
          client.socket.close(1013, 'Reconnect to synchronize');
          return;
        }
        const { eventId, reason, emittedAt } = signal;
        client.socket.send(
          JSON.stringify({
            type: 'notifications.changed',
            eventId,
            reason,
            emittedAt,
          }),
        );
        this.logger.log(
          JSON.stringify({
            event: 'notification_signal_delivered',
            delayMs: Math.max(0, Date.now() - Date.parse(emittedAt)),
          }),
        );
      }
    } catch (error) {
      this.reject(client, error);
    } finally {
      client.sending = false;
    }
  }

  private reject(client: Connection, error: unknown) {
    client.socket.close(
      error instanceof UnauthorizedException || error instanceof SyntaxError
        ? 4401
        : 1013,
      'Reconnect to authenticate',
    );
  }
  private unavailable() {
    if (this.healthy)
      this.logger.warn(
        JSON.stringify({ event: 'notification_subscription_unavailable' }),
      );
    this.healthy = false;
    for (const { socket } of this.sockets.values())
      socket.close(1013, 'Temporarily unavailable');
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    this.server?.off('upgrade', this.upgrade);
    for (const client of this.sockets.values()) {
      clearTimeout(client.authTimer);
      clearTimeout(client.expiryTimer);
      client.socket.terminate();
    }
    this.wss?.close();
    this.subscriber?.disconnect();
  }
}
