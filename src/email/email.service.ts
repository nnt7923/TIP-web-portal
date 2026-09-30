import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly emailFrom?: string;
  private readonly apiKey?: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('RESEND_API_KEY')?.trim();
    this.emailFrom = configService.get<string>('RESEND_FROM')?.trim();
    if (!this.apiKey || !this.emailFrom) {
      this.logger.warn('Email service requires RESEND_API_KEY and RESEND_FROM');
    }
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    if (!this.apiKey || !this.emailFrom) {
      throw new ServiceUnavailableException('Email service is not configured');
    }

    // Never log provider bodies or exceptions: they may contain recipient data.
    let failure = 'network_or_timeout';
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          from: this.emailFrom,
          to: [email],
          subject: 'Mã xác thực OTP',
          text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
          html: `<h2>Xác thực tài khoản</h2><p>Mã OTP của bạn là:</p><h1>${otp}</h1><p>Mã có hiệu lực trong 5 phút.</p>`,
        }),
      });
      if (response.ok) {
        failure = 'invalid_response';
        const data: unknown = await response.json();
        if (
          data &&
          typeof data === 'object' &&
          'id' in data &&
          typeof data.id === 'string' &&
          data.id.trim()
        ) {
          return;
        }
      } else {
        failure = `http_${response.status}`;
        await response.body?.cancel();
      }
    } catch {
      // One attempt only; a timeout can occur after the provider accepts mail.
    }
    this.logger.error(`Resend delivery failed (${failure})`);
    throw new ServiceUnavailableException('Email delivery is unavailable');
  }
}
