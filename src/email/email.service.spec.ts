import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('EmailService', () => {
  const createTransport = jest.mocked(nodemailer.createTransport);
  const sendMail = jest.fn<Promise<void>, [nodemailer.SendMailOptions]>();

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue(undefined);
    createTransport.mockReturnValue({
      sendMail,
    } as unknown as nodemailer.Transporter);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the configured SMTP settings and sender for OTP delivery', async () => {
    const service = new EmailService(
      new ConfigService({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'sender@example.com',
        SMTP_PASS: 'test-password',
        SMTP_FROM: 'TIP <sender@example.com>',
      }),
    );
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'sender@example.com', pass: 'test-password' },
    });
    await service.sendOtp('recipient@example.com', '123456');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'TIP <sender@example.com>',
        to: 'recipient@example.com',
        html: expect.stringContaining('123456') as string,
      }),
    );
  });

  it('uses TLS on port 465 and defaults the sender to SMTP_USER', async () => {
    const service = new EmailService(
      new ConfigService({
        SMTP_PORT: 465,
        SMTP_USER: 'sender@example.com',
        SMTP_PASS: 'test-password',
      }),
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
      }),
    );
    await service.sendOtp('recipient@example.com', '123456');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'sender@example.com' }),
    );
  });

  it('keeps support for legacy Gmail EMAIL_USER and EMAIL_PASSWORD', () => {
    new EmailService(
      new ConfigService({
        EMAIL_USER: 'legacy@example.com',
        EMAIL_PASSWORD: 'legacy-password',
      }),
    );
    expect(createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'legacy@example.com', pass: 'legacy-password' },
    });
  });

  it('does not combine incomplete SMTP credentials with legacy credentials', async () => {
    const service = new EmailService(
      new ConfigService({
        SMTP_USER: 'sender@example.com',
        EMAIL_USER: 'legacy@example.com',
        EMAIL_PASSWORD: 'legacy-password',
      }),
    );
    expect(createTransport).not.toHaveBeenCalled();
    await expect(
      service.sendOtp('recipient@example.com', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects missing configuration instead of pretending OTP was sent', async () => {
    const service = new EmailService(new ConfigService({}));
    await expect(
      service.sendOtp('recipient@example.com', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('propagates delivery failures so registration can roll back the account', async () => {
    const service = new EmailService(
      new ConfigService({
        SMTP_USER: 'sender@example.com',
        SMTP_PASS: 'test-password',
      }),
    );
    sendMail.mockRejectedValueOnce(new Error('Delivery failed'));
    await expect(
      service.sendOtp('recipient@example.com', '123456'),
    ).rejects.toThrow('Delivery failed');
  });
});
