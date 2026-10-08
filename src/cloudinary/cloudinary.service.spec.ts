import { PassThrough } from 'node:stream';
import {
  v2 as Cloudinary,
  UploadApiErrorResponse,
  UploadApiResponse,
} from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

describe('Cloudinary upload failure boundary', () => {
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
  });
});
