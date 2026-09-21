import { ForbiddenException } from '@nestjs/common';
import {
  CompanyUserRole,
  CompanyUserStatus,
  GlobalRole,
  Prisma,
  SchoolUserRole,
  SchoolUserStatus,
  StudentStatus,
} from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

export const placementSchoolRoles: SchoolUserRole[] = [
  SchoolUserRole.UNIVERSITY_ADMIN,
  SchoolUserRole.STAFF,
];

/** Quyền quản lý trường yêu cầu hồ sơ thực tế; không bypass theo globalRole. */
export function getPlacementUniversityId(user: CurrentUserData): string {
  const profile = user.schoolUser;
  if (
    !profile ||
    profile.status !== SchoolUserStatus.ACTIVE ||
    !placementSchoolRoles.includes(profile.role)
  ) {
    throw new ForbiddenException(
      'University administrator or staff permission is required',
    );
  }
  return profile.universityId;
}

/** Chỉ COMPANY_ADMIN đang hoạt động được xác nhận hoặc phân công người hướng dẫn công ty. */
export function getPlacementCompanyId(user: CurrentUserData): string {
  const profile = user.companyUser;
  if (
    !profile ||
    profile.status !== CompanyUserStatus.ACTIVE ||
    profile.role !== CompanyUserRole.COMPANY_ADMIN
  ) {
    throw new ForbiddenException(
      'An active company administrator profile is required',
    );
  }
  return profile.companyId;
}

/** System Admin xem toàn hệ thống; người hướng dẫn và sinh viên chỉ xem hồ sơ được giao/của mình. */
export function getPlacementReadScope(
  user: CurrentUserData,
): Prisma.PlacementWhereInput {
  if (user.globalRole === GlobalRole.SYSTEM_ADMIN) return {};
  const scopes: Prisma.PlacementWhereInput[] = [];
  if (user.student?.status === StudentStatus.ACTIVE) {
    scopes.push({
      studentId: user.student.id,
      student: { accountId: user.id },
    });
  }
  if (user.schoolUser?.status === SchoolUserStatus.ACTIVE) {
    scopes.push({
      universityId: user.schoolUser.universityId,
      ...(!placementSchoolRoles.includes(user.schoolUser.role) && {
        universitySupervisorId: user.schoolUser.id,
      }),
    });
  }
  if (user.companyUser?.status === CompanyUserStatus.ACTIVE) {
    scopes.push({
      companyId: user.companyUser.companyId,
      ...(user.companyUser.role !== CompanyUserRole.COMPANY_ADMIN && {
        companySupervisorId: user.companyUser.id,
      }),
    });
  }
  if (!scopes.length)
    throw new ForbiddenException(
      'You do not have permission to view placements',
    );
  return { OR: scopes };
}
