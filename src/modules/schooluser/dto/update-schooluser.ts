import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SchoolUserRole, SchoolUserStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateSchoolUserDto {
  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  fullName?: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptionalNotNull()
  @IsEmail()
  @Trim()
  email?: string;

  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
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

  @ApiPropertyOptional({ enum: SchoolUserRole, enumName: 'SchoolUserRole' })
  @IsOptionalNotNull()
  @IsEnum(SchoolUserRole)
  role?: SchoolUserRole;

  @ApiPropertyOptional({ enum: SchoolUserStatus, enumName: 'SchoolUserStatus' })
  @IsOptionalNotNull()
  @IsEnum(SchoolUserStatus)
  status?: SchoolUserStatus;
}
