import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { StudentEnrollmentStatus } from '@prisma/client';
import { Trim } from '../../common/decorators/validation.decorators';

export class CreateEnrollmentDto {
  @IsUUID() universityId: string;
  @IsUUID() majorId: string;
  @Trim() @IsString() @IsNotEmpty() @MaxLength(50) studentCode: string;
  @Trim() @IsString() @IsNotEmpty() @MaxLength(100) className: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(8) semester: number;
}

export class ReviewEnrollmentDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @ValidateIf(
    (dto: ReviewEnrollmentDto) =>
      dto.decision === 'REJECTED' || dto.reason !== undefined,
  )
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}

export class EnrollmentQueryDto {
  @IsOptional()
  @IsEnum(StudentEnrollmentStatus)
  status?: StudentEnrollmentStatus;
  @IsOptional() @Trim() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
