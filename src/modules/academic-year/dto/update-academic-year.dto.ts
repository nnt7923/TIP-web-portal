import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import { IsNotEmpty, IsString, IsEnum, IsDateString } from 'class-validator';
import { AcademicYearStatus } from '@prisma/client';

export class UpdateAcademicYearDto {
  @IsString()
  @IsOptionalNotNull()
  @Trim()
  @IsNotEmpty()
  name?: string;

  @IsDateString()
  @IsOptionalNotNull()
  startDate?: string;

  @IsDateString()
  @IsOptionalNotNull()
  endDate?: string;

  @IsOptionalNotNull()
  @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;
}
