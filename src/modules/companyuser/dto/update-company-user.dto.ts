import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyUserRole, CompanyUserStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class UpdateCompanyUserDto {
  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @Trim()
  fullName?: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptionalNotNull()
  @IsEmail()
  @Trim()
  email?: string;

  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @Trim()
  username?: string;

  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  phone?: string;

  @ApiPropertyOptional({ format: 'password', minLength: 8 })
  @IsOptionalNotNull()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: CompanyUserRole, enumName: 'CompanyUserRole' })
  @IsOptionalNotNull()
  @IsEnum(CompanyUserRole)
  role?: CompanyUserRole;

  @ApiPropertyOptional({
    enum: CompanyUserStatus,
    enumName: 'CompanyUserStatus',
  })
  @IsOptionalNotNull()
  @IsEnum(CompanyUserStatus)
  status?: CompanyUserStatus;
}
