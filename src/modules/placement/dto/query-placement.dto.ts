import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlacementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class QueryPlacementDto {
  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  keyword?: string;

  @ApiPropertyOptional({ enum: PlacementStatus, enumName: 'PlacementStatus' })
  @IsOptionalNotNull()
  @IsEnum(PlacementStatus)
  status?: PlacementStatus;

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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptionalNotNull()
  @IsUUID()
  studentInternshipId?: string;

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
