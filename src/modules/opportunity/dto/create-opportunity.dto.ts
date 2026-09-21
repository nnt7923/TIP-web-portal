import { OpportunityStatus, OpportunityType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';

export class CreateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  @Trim()
  title: string;

  @IsEnum(OpportunityType)
  type: OpportunityType;

  @IsString()
  @IsNotEmpty()
  @Trim()
  description: string;

  @IsOptional()
  @IsString()
  @Trim()
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  vacancies?: number;

  @IsOptional()
  @IsDateString()
  applicationDeadline?: string;

  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;
}
