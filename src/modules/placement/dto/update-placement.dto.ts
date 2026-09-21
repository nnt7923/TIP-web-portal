import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class UpdatePlacementDto {
  @ApiPropertyOptional({ description: 'Can be changed only while PENDING.' })
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  positionTitle?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptionalNotNull()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptionalNotNull()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Send null to unlink while PENDING.',
  })
  @IsOptional()
  @IsUUID()
  studentInternshipId?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Assign/reassign an active university supervisor, or null to unassign, before completion/cancellation.',
  })
  @IsOptional()
  @IsUUID()
  universitySupervisorId?: string | null;
}
