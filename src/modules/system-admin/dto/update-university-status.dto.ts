import { ApiProperty } from '@nestjs/swagger';
import { UniversityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateUniversityStatusDto {
  @ApiProperty({ enum: UniversityStatus, enumName: 'UniversityStatus' })
  @IsEnum(UniversityStatus)
  status: UniversityStatus;
}
