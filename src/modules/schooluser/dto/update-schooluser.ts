import { SchoolUserRole, SchoolUserStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateSchoolUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsEnum(SchoolUserRole)
  role?: SchoolUserRole;

  @IsOptional()
  @IsEnum(SchoolUserStatus)
  status?: SchoolUserStatus;
}
