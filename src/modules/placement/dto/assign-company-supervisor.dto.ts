import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class AssignCompanySupervisorDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'An active company user ID, or null to unassign.',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsUUID()
  companySupervisorId: string | null;
}
