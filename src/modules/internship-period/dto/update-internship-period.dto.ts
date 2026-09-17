import {
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { InternshipPeriodStatus } from '@prisma/client';

export class UpdateInternShipPeriodDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  periodNumber?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsDateString()
  @IsOptional()
  applyStartDate?: string;

  @IsDateString()
  @IsOptional()
  applyEndDate?: string;

  @IsOptional()
  @IsInt()
  requiredHours?: number;

  @IsOptional()
  @IsInt()
  requiredWeeks?: number;

  @IsOptional()
  @IsEnum(InternshipPeriodStatus)
  status?: InternshipPeriodStatus;
}
