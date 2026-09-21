import { ApiProperty } from '@nestjs/swagger';
import { CompanyUserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ApproveCompanyUserDto {
  @ApiProperty({ enum: CompanyUserRole, enumName: 'CompanyUserRole' })
  @IsEnum(CompanyUserRole)
  role: CompanyUserRole;
}
