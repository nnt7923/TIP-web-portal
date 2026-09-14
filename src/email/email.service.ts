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
  private readonly emailUser?: string;
  private readonly transporter?: nodemailer.Transporter;

  constructor(configService: ConfigService) {
    this.emailUser = configService.get<string>('EMAIL_USER');
    const emailPassword = configService.get<string>('EMAIL_PASSWORD');

    if (!this.emailUser || !emailPassword) {
      this.logger.warn('Email service is not configured');
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.emailUser,
        pass: emailPassword,
      },
    });
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    if (!this.transporter || !this.emailUser) {
      throw new ServiceUnavailableException('Email service is not configured');
    }

    await this.transporter.sendMail({
      from: this.emailUser,
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
