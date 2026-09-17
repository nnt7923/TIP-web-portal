import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StudentStatus } from '@prisma/client';

export class QueryStudentDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
