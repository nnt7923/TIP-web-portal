import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly emailFrom?: string;
  private readonly transporter?: nodemailer.Transporter;

  constructor(configService: ConfigService) {
    const smtpUser = configService.get<string>('SMTP_USER');
    const smtpPassword = configService.get<string>('SMTP_PASS');
    const useSmtp = Boolean(smtpUser || smtpPassword);
    const emailUser = useSmtp
      ? smtpUser
      : configService.get<string>('EMAIL_USER');
    const emailPassword = useSmtp
      ? smtpPassword
      : configService.get<string>('EMAIL_PASSWORD');
    this.emailFrom = configService.get<string>('SMTP_FROM') || emailUser;

    if (!emailUser || !emailPassword) {
      this.logger.warn(
        'Email service requires SMTP_USER/SMTP_PASS or EMAIL_USER/EMAIL_PASSWORD',
      );
      return;
    }

    const port = Number(configService.get<number>('SMTP_PORT', 587));
    this.transporter = nodemailer.createTransport({
      ...(useSmtp
        ? {
            host: configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
            port,
            secure: port === 465,
          }
        : { service: 'gmail' }),
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    if (!this.transporter || !this.emailFrom) {
      throw new ServiceUnavailableException('Email service is not configured');
    }

    await this.transporter.sendMail({
      from: this.emailFrom,
      to: email,
      subject: 'Mã xác thực OTP',
      html: `
        <h2>Xác thực tài khoản</h2>
        <p>Mã OTP của bạn là:</p>
        <h1>${otp}</h1>
        <p>Mã có hiệu lực trong 5 phút.</p>
      `,
    });
  }
}
