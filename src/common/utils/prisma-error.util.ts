import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface PrismaErrorMessages {
  duplicate?: string;
  notFound?: string;
}

/** Chuyển các mã lỗi Prisma phổ biến thành HTTP exception dễ hiểu cho API. */
export function handlePrismaError(
  error: unknown,
  messages: PrismaErrorMessages = {},
): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' && messages.duplicate) {
      throw new ConflictException(messages.duplicate);
    }

    if (error.code === 'P2025' && messages.notFound) {
      throw new NotFoundException(messages.notFound);
    }

    if (error.code === 'P2003') {
      throw new ConflictException(
        'Operation conflicts with related records. Check referenced IDs or remove dependencies first.',
      );
    }
    if (error.code === 'P2034') {
      throw new ConflictException(
        'Data changed concurrently. Please retry the request.',
      );
    }
  }

  throw error;
}
