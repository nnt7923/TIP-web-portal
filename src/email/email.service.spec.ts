import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { createConnection } from 'node:net';
import { EventEmitter } from 'node:events';
import { EmailService } from './email.service';
import { envValidationSchema } from '../config/env.validation';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('node:net', () => ({ createConnection: jest.fn() }));

describe('SMTP OTP delivery', () => {
  const sendMail = jest.fn();
  const close = jest.fn();
  const createTransport = jest.mocked(nodemailer.createTransport);
  const configured = () =>
    new EmailService(
      new ConfigService({
        SMTP_USER: 'sender@gmail.com',
        SMTP_PASS: 'private-password',
      }),
    );
  let log: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({
      accepted: ['recipient@example.com'],
      rejected: [],
    });
    createTransport.mockReturnValue({
      sendMail,
      close,
    } as unknown as nodemailer.Transporter);
    log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('uses STARTTLS and the Gmail sender, and sends only once', async () => {
    await configured().sendOtp('recipient@example.com', '123456');
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        requireTLS: true,
        secure: false,
        pool: false,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'sender@gmail.com',
        to: 'recipient@example.com',
        html: expect.stringContaining('123456') as string,
      }),
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });

  it('honors TLS port 465 and an explicit sender', async () => {
    await new EmailService(
      new ConfigService({
        SMTP_USER: 'sender@gmail.com',
        SMTP_PASS: 'private-password',
        SMTP_PORT: 465,
        SMTP_FROM: 'TIP <sender@gmail.com>',
      }),
    ).sendOtp('recipient@example.com', '123456');
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'TIP <sender@gmail.com>' }),
    );
  });

  it.each(['EAUTH', 'ECONNECTION'])(
    'sanitizes %s and never retries',
    async (code) => {
      sendMail.mockRejectedValueOnce(
        Object.assign(
          new Error('private-password recipient@example.com 123456'),
          { code },
        ),
      );
      await expect(
        configured().sendOtp('recipient@example.com', '123456'),
      ).rejects.toThrow('Email delivery is unavailable');
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('SMTP delivery failed (delivery_error)');
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /private-password|recipient@example.com|123456/,
      );
    },
  );

  it('rejects messages that the SMTP server did not accept', async () => {
    sendMail.mockResolvedValueOnce({
      accepted: [],
      rejected: ['recipient@example.com'],
    });
    await expect(
      configured().sendOtp('recipient@example.com', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('destroys the owned socket at the total deadline, without retrying', async () => {
    jest.useFakeTimers();
    const socket = Object.assign(new EventEmitter(), { destroy: jest.fn() });
    jest
      .mocked(createConnection)
      .mockReturnValue(
        socket as unknown as ReturnType<typeof createConnection>,
      );
    sendMail.mockImplementationOnce(() => {
      const options = createTransport.mock.calls[0][0] as {
        getSocket: (options: object, callback: jest.Mock) => void;
      };
      options.getSocket({}, jest.fn());
      socket.emit('connect');
      return new Promise(() => undefined);
    });
    const result = expect(
      configured().sendOtp('recipient@example.com', '123456'),
    ).rejects.toThrow('Email delivery is unavailable');
    await jest.advanceTimersByTimeAsync(8000);
    await result;
    expect(socket.destroy).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('SMTP delivery failed (timeout)');
  });

  it('rejects absent credentials without creating a connection', async () => {
    await expect(
      new EmailService(new ConfigService({})).sendOtp(
        'recipient@example.com',
        '123456',
      ),
    ).rejects.toThrow('Email service is not configured');
    expect(createTransport).not.toHaveBeenCalled();
  });
});

describe('SMTP production configuration', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test',
  };
  it('requires SMTP credentials and supplies Gmail defaults', () => {
    expect(envValidationSchema.validate(base).error).toBeDefined();
    const result = envValidationSchema.validate({
      ...base,
      SMTP_USER: 'sender@gmail.com',
      SMTP_PASS: 'app-password',
    });
    expect(result.error).toBeUndefined();
    expect((result.value as { SMTP_PORT: number }).SMTP_PORT).toBe(587);
    expect((result.value as { SMTP_HOST: string }).SMTP_HOST).toBe(
      'smtp.gmail.com',
    );
    expect(
      envValidationSchema.validate({
        ...base,
        SMTP_USER: 'sender@gmail.com',
        SMTP_PASS: '',
        SMTP_PORT: 25,
      }).error,
    ).toBeDefined();
  });
});
