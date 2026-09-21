import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The opportunity to apply for. Student and university are taken from the authenticated account.',
  })
  @IsUUID()
  opportunityId: string;
}
