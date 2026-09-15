import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { AcademicYearStatus } from '@prisma/client';

export class CreateAcademicYearDto {
  @IsUUID()
  universityId: string;

  @IsString()
  @IsNotEmpty()
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
