import { IsEnum, IsString, IsOptional } from 'class-validator';
import { InternshipPeriodStatus } from '@prisma/client';

export class QueryInternShipPeriodDto {
  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsEnum(InternshipPeriodStatus)
  status?: InternshipPeriodStatus;
}
