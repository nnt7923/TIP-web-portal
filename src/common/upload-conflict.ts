import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** A failed compare-and-swap must never delete the winning upload. */
export function rethrowUploadConflict(error: unknown): void {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    throw new ConflictException(
      'Tệp đã được thay đổi bởi yêu cầu khác. Vui lòng tải lại dữ liệu rồi thử lại.',
    );
  }
}
