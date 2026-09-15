import { IsEnum, IsString, IsOptional } from 'class-validator';
import { AcademicYearStatus } from '@prisma/client';

export class QueryAcademicYearDto {
  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;
}
