import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SchoolUserRole, SchoolUserStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QuerySchoolUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: SchoolUserRole, enumName: 'SchoolUserRole' })
  @IsOptional()
  @IsEnum(SchoolUserRole)
  role?: SchoolUserRole;

  @ApiPropertyOptional({ enum: SchoolUserStatus, enumName: 'SchoolUserStatus' })
  @IsOptional()
  @IsEnum(SchoolUserStatus)
  status?: SchoolUserStatus;
}
