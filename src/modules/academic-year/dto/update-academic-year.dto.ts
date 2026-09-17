import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { AcademicYearStatus } from '@prisma/client';

export class UpdateAcademicYearDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsOptional()
  @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;
}
