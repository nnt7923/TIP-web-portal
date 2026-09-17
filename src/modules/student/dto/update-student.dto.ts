import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import {
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { StudentStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateStudentDto {
  @IsOptionalNotNull()
  @IsUUID()
  majorId?: string;

  @IsString()
  @IsOptionalNotNull()
  @Trim()
  @IsNotEmpty()
  studentCode?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(8)
  semester?: number;

  @IsString()
  @IsOptionalNotNull()
  @Trim()
  className?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  cvUrl?: string;

  @IsOptionalNotNull()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
