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
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class UpdateOpportunityDto {
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @Trim()
  title?: string;

  @IsOptionalNotNull()
  @IsEnum(OpportunityType)
  type?: OpportunityType;

  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @Trim()
  description?: string;

  @IsOptional()
  @IsString()
  @Trim()
  location?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  vacancies?: number | null;

  @IsOptional()
  @IsDateString()
  applicationDeadline?: string | null;

  @IsOptionalNotNull()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;
}
