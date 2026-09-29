import { BadRequestException } from '@nestjs/common';
import { UniversityStatus } from '@prisma/client';

/** PENDING is an initial state, never a way to reset an approved record. */
export function assertPendingStatusTransition(
  current: string,
  next?: string,
): void {
  if (next === 'PENDING' && current !== 'PENDING') {
    throw new BadRequestException(
      'Không thể chuyển lại trạng thái PENDING sau khi đã xử lý.',
    );
  }
}

export function assertUniversityStatusTransition(
  current: UniversityStatus,
  next?: UniversityStatus,
): void {
  const order: Record<UniversityStatus, number> = {
    PENDING: 0,
    VERIFIED: 1,
    SUSPENDED: 2,
    INACTIVE: 3,
  };
  if (next !== undefined && order[next] < order[current]) {
    throw new BadRequestException(
      `Không thể quay lại trạng thái trước đó: ${current} -> ${next}`,
    );
  }
}
