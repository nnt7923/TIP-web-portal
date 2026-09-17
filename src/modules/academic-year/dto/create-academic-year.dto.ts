import { Trim } from '../../../common/decorators/validation.decorators';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { AcademicYearStatus } from '@prisma/client';

export class CreateAcademicYearDto {
  @IsString()
  @IsNotEmpty()
  @Trim()
  name: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsOptional()
  @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;
}
