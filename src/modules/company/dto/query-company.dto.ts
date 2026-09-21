import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CompanyStatus } from '@prisma/client';
import { Trim } from '../../../common/decorators/validation.decorators';

export class QueryCompanyDto {
  @IsOptional()
  @IsString()
  @Trim()
  keyword?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}
