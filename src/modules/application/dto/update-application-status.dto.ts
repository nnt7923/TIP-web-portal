import { ApiProperty } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export const applicationReviewStatuses = [
  ApplicationStatus.REVIEWING,
  ApplicationStatus.ACCEPTED,
  ApplicationStatus.REJECTED,
] as const;

export class UpdateApplicationStatusDto {
  @ApiProperty({
    enum: applicationReviewStatuses,
    description:
      'Company Admin/System Admin decision. Students use the withdraw endpoint.',
  })
  @IsIn(applicationReviewStatuses)
  status: (typeof applicationReviewStatuses)[number];
}
