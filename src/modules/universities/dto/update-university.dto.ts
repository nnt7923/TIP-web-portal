import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import { IsNotEmpty } from 'class-validator';
import { IsEnum, IsString, IsUrl } from 'class-validator';
import { UniversityStatus } from '@prisma/client';

export class UpdateUniversityDto {
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  name?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  code?: string;

  @IsOptionalNotNull()
  @IsUrl()
  website?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  address?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  logoUrl?: string;

  @IsOptionalNotNull()
  @IsEnum(UniversityStatus)
  status?: UniversityStatus;
}
