import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { UniversityStatus } from '@prisma/client';

export class UpdateUniversityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsEnum(UniversityStatus)
  status?: UniversityStatus;
}
