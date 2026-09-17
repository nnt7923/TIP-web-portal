import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { StudentStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateStudentDto {
  @IsOptional()
  @IsUUID()
  majorId?: string;

  @IsString()
  @IsOptional()
  studentCode?: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(8)
  semester?: number;

  @IsString()
  @IsOptional()
  className?: string;

  @IsOptional()
  @IsString()
  cvUrl?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
