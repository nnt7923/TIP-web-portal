import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsOptionalNotNull } from '../../../common/decorators/validation.decorators';

export class ConfirmPlacementDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'An active STAFF or COMPANY_ADMIN profile in your company.',
  })
  @IsOptionalNotNull()
  @IsUUID()
  companySupervisorId?: string;
}
