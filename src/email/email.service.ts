import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { createConnection, type Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendOtp(email: string, otp: string): Promise<void> {
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS');
    if (!user || !pass) {
      throw new ServiceUnavailableException('Email service is not configured');
    }
    const port = Number(this.config.get('SMTP_PORT', 587));
    const host = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    let socket: Socket | undefined;
    let timedOut = false;
    // A transport per message lets the deadline close only this connection.
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      pool: false,
      auth: { user, pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      logger: false,
      debug: false,
      // Own the socket so the total deadline also aborts a stalled SMTP send.
      getSocket: (_options, callback) => {
        if (timedOut) return callback(new Error('SMTP deadline exceeded'));
        socket =
          port === 465
            ? connectTls({ host, port, servername: host })
            : createConnection({ host, port });
        const onError = (error: Error) => callback(error);
        socket.once('error', onError);
        socket.once(port === 465 ? 'secureConnect' : 'connect', () => {
          socket!.removeListener('error', onError);
          callback(null, { connection: socket, secured: port === 465 });
        });
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        transport.sendMail({
          from: this.config.get<string>('SMTP_FROM')?.trim() || user,
          to: email,
          subject: 'Mã xác thực OTP',
          text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
          html: `<h2>Xác thực tài khoản</h2><p>Mã OTP của bạn là:</p><h1>${otp}</h1><p>Mã có hiệu lực trong 5 phút.</p>`,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            socket?.destroy();
            transport.close();
            reject(new Error('SMTP deadline exceeded'));
          }, 8000);
        }),
      ]);
      if (!result.accepted?.length || result.rejected?.length) {
        throw new Error('SMTP recipient not accepted');
      }
    } catch {
      // Provider errors can contain credentials, addresses or mail content.
      this.logger.error(
        `SMTP delivery failed (${timedOut ? 'timeout' : 'delivery_error'})`,
      );
      throw new ServiceUnavailableException('Email delivery is unavailable');
    } finally {
      if (timer) clearTimeout(timer);
      transport.close();
      socket?.destroy();
    }
  }
}
