import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyUserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';

export class CreateCompanyUserDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  companyId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Trim()
  fullName: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @Trim()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Trim()
  username: string;

  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Trim()
  phone?: string;

  @ApiProperty({ enum: CompanyUserRole, enumName: 'CompanyUserRole' })
  @IsEnum(CompanyUserRole)
  role: CompanyUserRole;
}
