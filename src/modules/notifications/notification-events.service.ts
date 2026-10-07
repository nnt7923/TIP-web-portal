import { Injectable } from '@nestjs/common';
import { Placement, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

export const schoolRecipients = (
  universityId: string,
  includeStaff = false,
): Prisma.AccountWhereInput => ({
  schoolUser: {
    universityId,
    status: 'ACTIVE',
    role: {
      in: includeStaff ? ['UNIVERSITY_ADMIN', 'STAFF'] : ['UNIVERSITY_ADMIN'],
    },
  },
});
export const companyRecipients = (
  companyId: string,
): Prisma.AccountWhereInput => ({
  companyUser: { companyId, status: 'ACTIVE', role: 'COMPANY_ADMIN' },
});

@Injectable()
export class NotificationEventsService {
  constructor(private readonly notifications: NotificationsService) {}

  transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
      maxWait?: number;
      timeout?: number;
    },
  ) {
    return this.notifications.transaction(work, options);
  }

  async pendingProfile(tx: Prisma.TransactionClient, accountId: string) {
    const account = await tx.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { schoolUser: true, companyUser: true },
    });
    for (const profile of [account.schoolUser, account.companyUser]) {
      if (!profile || profile.status !== 'PENDING') continue;
      const isSchool = 'universityId' in profile;
      const universityRegistration =
        isSchool && profile.role === 'UNIVERSITY_ADMIN';
      const recipients: Prisma.AccountWhereInput[] = [
        { globalRole: 'SYSTEM_ADMIN' },
      ];
      if (isSchool && !universityRegistration)
        recipients.push(schoolRecipients(profile.universityId));
      if (!isSchool) recipients.push(companyRecipients(profile.companyId));
      await this.notifications.emit(tx, {
        // Stable across email changes/reverification; each profile is announced at most once per recipient.
        eventId: `profile-pending:${profile.id}`,
        actorId: accountId,
        type: 'PROFILE_PENDING',
        title: 'Hồ sơ mới chờ duyệt',
        body: 'Có hồ sơ đã xác thực email đang chờ xét duyệt.',
        entityType: universityRegistration
          ? 'UniversityRegistration'
          : isSchool
            ? 'SchoolUser'
            : 'CompanyUser',
        entityId: universityRegistration ? accountId : profile.id,
        recipients,
      });
    }
  }

  async profileApproved(
    tx: Prisma.TransactionClient,
    actorId: string,
    accountId: string,
    profileId: string,
  ) {
    await this.notifications.emit(tx, {
      eventId: `profile-approved:${profileId}`,
      actorId,
      type: 'PROFILE_APPROVED',
      title: 'Hồ sơ đã được duyệt',
      body: 'Hồ sơ của bạn đã được duyệt. Bạn có thể truy cập các chức năng được cấp.',
      entityType: 'AccountProfile',
      entityId: accountId,
      recipients: [{ id: accountId }],
    });
  }

  async enrollment(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    action: string,
  ) {
    if (
      ![
        'STUDENT_ENROLLMENT_SUBMITTED',
        'STUDENT_ENROLLMENT_APPROVED',
        'STUDENT_ENROLLMENT_REJECTED',
      ].includes(action)
    )
      return;
    const row = await tx.studentEnrollment.findUniqueOrThrow({ where: { id } });
    const submitted = action === 'STUDENT_ENROLLMENT_SUBMITTED';
    await this.notifications.emit(tx, {
      eventId: `${action}:${id}`,
      actorId,
      type: action,
      title: submitted
        ? 'Yêu cầu sinh viên chờ duyệt'
        : row.status === 'APPROVED'
          ? 'Yêu cầu sinh viên đã được duyệt'
          : 'Yêu cầu sinh viên bị từ chối',
      body: submitted
        ? 'Có yêu cầu trở thành sinh viên đang chờ xét duyệt.'
        : 'Yêu cầu của bạn đã được xử lý. Mở hồ sơ để xem chi tiết.',
      entityType: submitted ? 'StudentEnrollmentReview' : 'StudentEnrollment',
      entityId: id,
      recipients: submitted
        ? [schoolRecipients(row.universityId)]
        : [{ id: row.accountId }],
    });
  }

  async application(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    action: string,
    eventId: string,
  ) {
    const row = await tx.application.findUniqueOrThrow({
      where: { id },
      select: {
        studentId: true,
        status: true,
        opportunity: { select: { companyId: true } },
      },
    });
    const reviewed = action === 'APPLICATION_STATUS_UPDATED';
    const statuses: Record<string, string> = {
      REVIEWING: 'đang được xét duyệt',
      ACCEPTED: 'đã được chấp nhận',
      REJECTED: 'đã bị từ chối',
    };
    await this.notifications.emit(tx, {
      eventId,
      actorId,
      type: reviewed ? `APPLICATION_${row.status}` : action,
      title: reviewed
        ? 'Cập nhật đơn ứng tuyển'
        : action === 'APPLICATION_CREATED'
          ? 'Có đơn ứng tuyển mới'
          : 'Đơn ứng tuyển đã được rút',
      body: reviewed
        ? `Đơn ứng tuyển của bạn ${statuses[row.status] ?? 'được cập nhật'}.`
        : 'Danh sách ứng tuyển của doanh nghiệp vừa thay đổi.',
      entityType: 'Application',
      entityId: id,
      recipients: reviewed
        ? [{ student: { id: row.studentId, status: 'ACTIVE' } }]
        : [companyRecipients(row.opportunity.companyId)],
    });
  }

  async internshipRegistration(
    tx: Prisma.TransactionClient,
    actorId: string,
    studentId: string,
    periodId: string,
    registrationId: string,
  ) {
    await this.notifications.emit(tx, {
      eventId: `internship-registration:${registrationId}`,
      actorId,
      type: 'INTERNSHIP_REGISTERED',
      title: 'Đã đăng ký đợt thực tập',
      body: 'Nhà trường đã đăng ký bạn vào một đợt thực tập.',
      entityType: 'InternshipPeriod',
      entityId: periodId,
      recipients: [{ student: { id: studentId, status: 'ACTIVE' } }],
    });
  }

  async placement(
    tx: Prisma.TransactionClient,
    actorId: string,
    next: Placement,
    previous?: Placement,
  ) {
    const assignmentChanged =
      !!previous &&
      (previous.universitySupervisorId !== next.universitySupervisorId ||
        previous.companySupervisorId !== next.companySupervisorId);
    const detailsChanged =
      !!previous &&
      (previous.status !== next.status ||
        previous.startDate.getTime() !== next.startDate.getTime() ||
        previous.endDate.getTime() !== next.endDate.getTime() ||
        previous.positionTitle !== next.positionTitle ||
        previous.studentInternshipId !== next.studentInternshipId);
    if (previous && !assignmentChanged && !detailsChanged) return;
    const recipients: Prisma.AccountWhereInput[] = [
      { student: { id: next.studentId, status: 'ACTIVE' } },
    ];
    if (!previous || detailsChanged) {
      recipients.push(companyRecipients(next.companyId));
      if (previous) recipients.push(schoolRecipients(next.universityId, true));
    }
    // On reassignment include both old and new supervisors, scoped to their organizations.
    const schoolIds = [
      next.universitySupervisorId,
      assignmentChanged ? previous?.universitySupervisorId : null,
    ].filter((id): id is string => !!id);
    const companyIds = [
      next.companySupervisorId,
      assignmentChanged ? previous?.companySupervisorId : null,
    ].filter((id): id is string => !!id);
    if (schoolIds.length)
      recipients.push({
        schoolUser: {
          id: { in: schoolIds },
          universityId: next.universityId,
          status: 'ACTIVE',
        },
      });
    if (companyIds.length)
      recipients.push({
        companyUser: {
          id: { in: companyIds },
          companyId: next.companyId,
          status: 'ACTIVE',
        },
      });
    await this.notifications.emit(tx, {
      actorId,
      type: !previous
        ? 'PLACEMENT_CREATED'
        : detailsChanged
          ? 'PLACEMENT_UPDATED'
          : 'PLACEMENT_SUPERVISOR_CHANGED',
      title: !previous
        ? 'Hồ sơ thực tập mới'
        : detailsChanged
          ? 'Cập nhật hồ sơ thực tập'
          : 'Thay đổi người hướng dẫn',
      body: 'Hồ sơ thực tập liên quan đến bạn vừa được cập nhật. Mở hồ sơ để xem chi tiết.',
      entityType: 'Placement',
      entityId: next.id,
      recipients,
    });
  }
}
