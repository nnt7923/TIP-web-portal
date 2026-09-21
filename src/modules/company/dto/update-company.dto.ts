import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { CompanyStatus } from '@prisma/client';

export class UpdateCompanyDto {
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  name?: string;

  @IsOptionalNotNull()
  @ValidateIf((_object, value: unknown) => value !== '')
  @IsUrl()
  @Trim()
  website?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  address?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  industry?: string;

  @IsOptionalNotNull()
  @ValidateIf((_object, value: unknown) => value !== '')
  @IsUrl()
  @Trim()
  logoUrl?: string;

  @IsOptionalNotNull()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}
