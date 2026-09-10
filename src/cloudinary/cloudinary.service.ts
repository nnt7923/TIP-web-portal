import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  UploadApiOptions,
  UploadApiResponse,
  v2 as Cloudinary,
} from 'cloudinary';
import { CLOUDINARY } from './cloudinary.constants';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: typeof Cloudinary,
  ) {}

  uploadBuffer(
    file: Buffer,
    options: UploadApiOptions = {},
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = this.cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            reject(new Error(error.message));
            return;
          }

          if (!result) {
            reject(new Error('Cloudinary did not return an upload result'));
            return;
          }

          resolve(result);
        },
      );

      stream.end(file);
    });
  }

  destroy(publicId: string): Promise<unknown> {
    return this.cloudinary.uploader.destroy(publicId);
  }

  /** Xóa một tài nguyên Cloudinary và chỉ ghi cảnh báo nếu thao tác thất bại. */
  async destroySafely(publicId: string): Promise<void> {
    try {
      await this.destroy(publicId);
    } catch {
      this.logger.warn(`Could not delete Cloudinary asset "${publicId}"`);
    }
  }
}
