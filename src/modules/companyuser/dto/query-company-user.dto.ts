import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyUserRole, CompanyUserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';

export class QueryCompanyUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Trim()
  keyword?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ enum: CompanyUserRole, enumName: 'CompanyUserRole' })
  @IsOptional()
  @IsEnum(CompanyUserRole)
  role?: CompanyUserRole;

  @ApiPropertyOptional({
    enum: CompanyUserStatus,
    enumName: 'CompanyUserStatus',
  })
  @IsOptional()
  @IsEnum(CompanyUserStatus)
  status?: CompanyUserStatus;
}
