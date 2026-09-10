import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SchoolUserRole, SchoolUserStatus } from '@prisma/client';

export class QuerySchoolUserDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(SchoolUserRole)
  role?: SchoolUserRole;

  @IsOptional()
  @IsEnum(SchoolUserStatus)
  status?: SchoolUserStatus;
}
