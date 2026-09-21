import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class CreatePlacementDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'An ACCEPTED application. Student, company and opportunity are derived from it.',
  })
  @IsOptionalNotNull()
  @IsUUID()
  applicationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for a direct placement without applicationId.',
  })
  @IsOptionalNotNull()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for a direct placement without applicationId.',
  })
  @IsOptionalNotNull()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptionalNotNull()
  @IsUUID()
  opportunityId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The internship registration of this student in this university.',
  })
  @IsOptionalNotNull()
  @IsUUID()
  studentInternshipId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'An active UNIVERSITY_SUPERVISOR in the same university.',
  })
  @IsOptionalNotNull()
  @IsUUID()
  universitySupervisorId?: string;

  @ApiProperty({ example: 'Backend Developer Intern' })
  @IsString()
  @Trim()
  @IsNotEmpty()
  positionTitle: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString({ strict: true })
  startDate: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString({ strict: true })
  endDate: string;
}
