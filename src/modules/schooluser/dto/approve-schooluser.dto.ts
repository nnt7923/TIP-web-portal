import { ApiProperty } from '@nestjs/swagger';
import { SchoolUserRole } from '@prisma/client';
import { IsIn } from 'class-validator';

export class ApproveSchoolUserDto {
  @ApiProperty({
    enum: [SchoolUserRole.STAFF, SchoolUserRole.UNIVERSITY_SUPERVISOR],
  })
  @IsIn([SchoolUserRole.STAFF, SchoolUserRole.UNIVERSITY_SUPERVISOR])
  role: SchoolUserRole;
}
