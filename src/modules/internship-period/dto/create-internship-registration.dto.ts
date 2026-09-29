import { IsUUID } from 'class-validator';

export class CreateInternshipRegistrationDto {
  @IsUUID()
  studentId: string;
}
