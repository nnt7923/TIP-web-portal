import { Prisma } from '@prisma/client';

const contact = {
  fullName: true,
  email: true,
  phone: true,
} satisfies Prisma.AccountSelect;

// Chỉ lấy thông tin hồ sơ cần thiết; không trả passwordHash hoặc dữ liệu phiên đăng nhập.
export const placementInclude = {
  university: { select: { id: true, name: true, code: true } },
  company: { select: { id: true, name: true } },
  student: {
    select: { id: true, studentCode: true, account: { select: contact } },
  },
  application: { select: { id: true, status: true } },
  opportunity: { select: { id: true, title: true, type: true } },
  studentInternship: {
    select: {
      id: true,
      status: true,
      internshipPeriod: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
    },
  },
  universitySupervisor: {
    select: { id: true, role: true, account: { select: contact } },
  },
  companySupervisor: {
    select: { id: true, role: true, account: { select: contact } },
  },
} satisfies Prisma.PlacementInclude;

export type PlacementDetail = Prisma.PlacementGetPayload<{
  include: typeof placementInclude;
}>;
