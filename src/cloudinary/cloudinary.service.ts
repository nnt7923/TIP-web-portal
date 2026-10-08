import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
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
      let settled = false;
      let failed = false;
      let stream:
        ReturnType<typeof this.cloudinary.uploader.upload_stream> | undefined;
      const fail = (timeout = false) => {
        if (settled) return;
        settled = true;
        failed = true;
        clearTimeout(deadline);
        stream?.destroy();
        reject(
          timeout
            ? new GatewayTimeoutException(
                'Dịch vụ lưu tệp phản hồi quá chậm. Vui lòng kiểm tra hồ sơ rồi thử lại.',
              )
            : new BadGatewayException(
                'Không thể lưu tệp lúc này. Vui lòng thử lại.',
              ),
        );
      };
      // SDK timeout is an idle timeout; also cap total elapsed upload time.
      const deadline = setTimeout(() => fail(true), 30000);
      try {
        stream = this.cloudinary.uploader.upload_stream(
          { ...options, timeout: 30000 },
          (error, result) => {
            if (settled) {
              // A late provider success must not leave an unreferenced asset.
              if (failed && result?.public_id)
                void this.destroySafely(
                  result.public_id,
                  result.resource_type === 'raw'
                    ? 'raw'
                    : result.resource_type === 'video'
                      ? 'video'
                      : 'image',
                );
              return;
            }
            if (error) {
              this.logger.warn('Cloudinary upload failed');
              fail(
                error.name === 'TimeoutError' ||
                  error.http_code === 499 ||
                  error.http_code === 504,
              );
              return;
            }

            if (!result) {
              fail();
              return;
            }

            settled = true;
            clearTimeout(deadline);
            resolve(result);
          },
        );

        stream.on('error', () => fail());
        stream.end(file);
      } catch {
        fail();
      }
    });
  }

  destroy(
    publicId: string,
    resourceType: 'image' | 'raw' | 'video' = 'image',
  ): Promise<unknown> {
    return this.cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  }

  /** Xóa một tài nguyên Cloudinary và chỉ ghi cảnh báo nếu thao tác thất bại. */
  async destroySafely(
    publicId: string,
    resourceType: 'image' | 'raw' | 'video' = 'image',
  ): Promise<void> {
    try {
      await this.destroy(publicId, resourceType);
    } catch {
      this.logger.warn(`Could not delete Cloudinary asset "${publicId}"`);
    }
  }
}
