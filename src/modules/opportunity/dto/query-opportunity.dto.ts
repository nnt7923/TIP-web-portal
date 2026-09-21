import { OpportunityStatus, OpportunityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';

export class QueryOpportunityDto {
  @IsOptional()
  @IsString()
  @Trim()
  keyword?: string;

  @IsOptional()
  @IsEnum(OpportunityType)
  type?: OpportunityType;

  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;
}
