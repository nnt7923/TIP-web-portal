import { AccountStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateAccountStatusDto {
  @ApiProperty({ enum: AccountStatus, enumName: 'AccountStatus' })
  @IsEnum(AccountStatus)
  status: AccountStatus;
}
