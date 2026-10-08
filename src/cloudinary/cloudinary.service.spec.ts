import { PassThrough } from 'node:stream';
import { Logger } from '@nestjs/common';
import {
  v2 as Cloudinary,
  UploadApiErrorResponse,
  UploadApiResponse,
} from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

describe('Cloudinary upload failure boundary', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('caps total upload time and cleans a late provider success', async () => {
    jest.useFakeTimers();
    try {
      let callback:
        | ((error?: UploadApiErrorResponse, result?: UploadApiResponse) => void)
        | undefined;
      const stream = new PassThrough();
      const destroy = jest.fn().mockResolvedValue({ result: 'ok' });
      const cloud = {
        uploader: {
          upload_stream: (_options: unknown, cb: typeof callback) => {
            callback = cb;
            return stream;
          },
          destroy,
        },
      } as unknown as typeof Cloudinary;
      const promise = new CloudinaryService(cloud).uploadBuffer(
        Buffer.from('fixture'),
      );
      const assertion = expect(promise).rejects.toMatchObject({ status: 504 });
      jest.advanceTimersByTime(30000);
      await assertion;
      expect(stream.destroyed).toBe(true);
      callback!(undefined, {
        public_id: 'late.docx',
        resource_type: 'raw',
      } as UploadApiResponse);
      expect(destroy).toHaveBeenCalledWith('late.docx', {
        resource_type: 'raw',
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'Cloudinary upload failed (stage=deadline, status=unknown, kind=timeout)',
      );
    } finally {
      jest.useRealTimers();
    }
  });
  it.each([
    [
      { message: 'secret provider details', name: 'Error', http_code: 400 },
      502,
    ],
    [{ message: 'Request Timeout', name: 'TimeoutError', http_code: 499 }, 504],
    [undefined, 502],
  ] as const)(
    'sanitizes errors and enforces a 30 second timeout',
    async (error, status) => {
      const upload = jest.fn(
        (
          _options,
          cb: (
            error?: UploadApiErrorResponse,
            result?: UploadApiResponse,
          ) => void,
        ) => {
          queueMicrotask(() => cb(error));
          return new PassThrough();
        },
      );
      const cloud = {
        uploader: { upload_stream: upload },
      } as unknown as typeof Cloudinary;
      const service = new CloudinaryService(cloud);
      await expect(
        service.uploadBuffer(Buffer.from('fixture')),
      ).rejects.toMatchObject({ status });
      expect(upload.mock.calls[0][0]).toMatchObject({ timeout: 30000 });
    },
  );
  it.each([
    [403, 'UnexpectedResponse', undefined, '403', 'UnexpectedResponse'],
    [401, 'Error', undefined, '401', 'Error'],
    [400, 'Error', undefined, '400', 'Error'],
    [undefined, 'Error', 'ECONNRESET', 'unknown', 'ECONNRESET'],
    ['private-status', 'private-kind', 'private-code', 'unknown', 'unknown'],
  ])(
    'logs only allowlisted failure metadata (%s)',
    async (http_code, name, code, status, kind) => {
      const cloud = {
        uploader: {
          upload_stream: (
            _options: unknown,
            callback: (error: unknown) => void,
          ) => {
            queueMicrotask(() =>
              callback({
                http_code,
                name,
                code,
                message: 'private provider message with API secret',
                stack: 'private stack trace',
              }),
            );
            return new PassThrough();
          },
        },
      } as unknown as typeof Cloudinary;
      await expect(
        new CloudinaryService(cloud).uploadBuffer(Buffer.from('private CV')),
      ).rejects.toMatchObject({ status: 502 });
      expect(warn.mock.calls).toEqual([
        [
          `Cloudinary upload failed (stage=provider, status=${status}, kind=${kind})`,
        ],
      ]);
    },
  );
  it('handles stream failures without an unhandled error', async () => {
    const stream = new PassThrough();
    const cloud = {
      uploader: { upload_stream: () => stream },
    } as unknown as typeof Cloudinary;
    const promise = new CloudinaryService(cloud).uploadBuffer(
      Buffer.from('fixture'),
    );
    stream.emit('error', new Error('sensitive internal message'));
    await expect(promise).rejects.toMatchObject({ status: 502 });
    expect(warn).toHaveBeenCalledWith(
      'Cloudinary upload failed (stage=stream, status=unknown, kind=Error)',
    );
  });
  it('sanitizes synchronous SDK failures', async () => {
    const cloud = {
      uploader: {
        upload_stream: () => {
          throw new Error('private SDK details');
        },
      },
    } as unknown as typeof Cloudinary;
    await expect(
      new CloudinaryService(cloud).uploadBuffer(Buffer.from('fixture')),
    ).rejects.toMatchObject({ status: 502 });
    expect(warn).toHaveBeenCalledWith(
      'Cloudinary upload failed (stage=setup, status=unknown, kind=Error)',
    );
  });
});
