import { ForbiddenException } from '@nestjs/common';
import {
  AccountStatus,
  GlobalRole,
  Prisma,
  SchoolUserStatus,
  StudentStatus,
  UniversityStatus,
} from '@prisma/client';

export const authProfileInclude = {
  schoolUser: { include: { university: { select: { status: true } } } },
  student: { include: { university: { select: { status: true } } } },
} satisfies Prisma.AccountInclude;

export const currentAccountSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  globalRole: true,
  status: true,
  deletedAt: true,
  emailVerifiedAt: true,
  ...authProfileInclude,
} satisfies Prisma.AccountSelect;

type AuthAccount = Prisma.AccountGetPayload<{
  select: typeof currentAccountSelect;
}>;

/** Dùng chung cho login, refresh và mọi request JWT để khóa có hiệu lực ngay. */
export function assertAccountCanAuthenticate(account: AuthAccount): void {
  if (account.deletedAt || account.status !== AccountStatus.ACTIVE) {
    throw new ForbiddenException('Account is not active');
  }
  if (!account.emailVerifiedAt) {
    throw new ForbiddenException('Email has not been verified');
  }
  if (account.globalRole === GlobalRole.SYSTEM_ADMIN) return;
  if (!account.schoolUser && !account.student) {
    throw new ForbiddenException('Account has no organization profile');
  }
  if (
    account.schoolUser &&
    account.schoolUser.status !== SchoolUserStatus.ACTIVE
  ) {
    throw new ForbiddenException(
      'School account is not active or is waiting for approval',
    );
  }
  if (account.student && account.student.status !== StudentStatus.ACTIVE) {
    throw new ForbiddenException('Student is not active');
  }
  for (const profile of [account.schoolUser, account.student]) {
    if (
      profile &&
      (profile.university.status === UniversityStatus.SUSPENDED ||
        profile.university.status === UniversityStatus.INACTIVE)
    ) {
      throw new ForbiddenException('University is suspended or inactive');
    }
  }
}
