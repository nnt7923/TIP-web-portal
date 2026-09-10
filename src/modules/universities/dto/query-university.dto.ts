import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UniversityStatus } from '@prisma/client';

export class QueryUniversityDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(UniversityStatus)
  status?: UniversityStatus;
}