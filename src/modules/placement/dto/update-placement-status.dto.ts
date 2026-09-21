import { ApiProperty } from '@nestjs/swagger';
import { PlacementStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export const schoolPlacementStatuses = [
  PlacementStatus.IN_PROGRESS,
  PlacementStatus.COMPLETED,
  PlacementStatus.CANCELLED,
] as const;

export class UpdatePlacementStatusDto {
  @ApiProperty({
    enum: schoolPlacementStatuses,
    description:
      'University staff manage progress/cancellation. Companies use the confirm endpoint.',
  })
  @IsIn(schoolPlacementStatuses)
  status: (typeof schoolPlacementStatuses)[number];
}
