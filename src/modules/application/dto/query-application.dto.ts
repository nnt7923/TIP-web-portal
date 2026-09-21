import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class QueryApplicationDto {
  @ApiPropertyOptional({
    description:
      'Search opportunity title or student name/code within the permitted scope.',
  })
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  keyword?: string;

  @ApiPropertyOptional({
    enum: ApplicationStatus,
    enumName: 'ApplicationStatus',
  })
  @IsOptionalNotNull()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptionalNotNull()
  @IsUUID()
  opportunityId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptionalNotNull()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptionalNotNull()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptionalNotNull()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
