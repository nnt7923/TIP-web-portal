import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { InternshipPeriodStatus } from '@prisma/client';

export class UpdateInternShipPeriodDto {
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  name?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(3)
  periodNumber?: number;

  @IsDateString()
  @IsOptionalNotNull()
  startDate?: string;

  @IsDateString()
  @IsOptionalNotNull()
  endDate?: string;

  @IsDateString()
  @IsOptionalNotNull()
  applyStartDate?: string;

  @IsDateString()
  @IsOptionalNotNull()
  applyEndDate?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  requiredHours?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  requiredWeeks?: number;

  @IsOptionalNotNull()
  @IsEnum(InternshipPeriodStatus)
  status?: InternshipPeriodStatus;
}
