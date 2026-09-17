import { ForbiddenException } from '@nestjs/common';
import type { CurrentUserData } from '../decorators/current-user.decorator';

/** Lấy phạm vi trường từ profile đã xác thực của nhân viên hoặc sinh viên. */
export function getUniversityId(user: CurrentUserData): string {
  const id = user.schoolUser?.universityId ?? user.student?.universityId;
  if (!id) throw new ForbiddenException('University profile was not found');
  return id;
}
