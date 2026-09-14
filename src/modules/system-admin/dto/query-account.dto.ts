import { AccountStatus, GlobalRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryAccountDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(GlobalRole)
  globalRole?: GlobalRole;

  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;
}
