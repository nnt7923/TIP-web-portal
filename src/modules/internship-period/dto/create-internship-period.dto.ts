import { Trim } from '../../../common/decorators/validation.decorators';
import {
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { InternshipPeriodStatus } from '@prisma/client';

export class CreateInternShipPeriodDto {
  @IsUUID()
  academicYearId: string;

  @IsNotEmpty()
  @IsString()
  @Trim()
  name: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(3)
  periodNumber: number;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsDateString()
  @IsNotEmpty()
  applyStartDate: string;

  @IsDateString()
  @IsNotEmpty()
  applyEndDate: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  requiredHours: number;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  requiredWeeks: number;

  @IsOptional()
  @IsEnum(InternshipPeriodStatus)
  status?: InternshipPeriodStatus;
}
