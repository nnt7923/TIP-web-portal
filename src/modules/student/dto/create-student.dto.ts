import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStudentDto {
  @IsUUID()
  accountId: string;

  @IsUUID()
  majorId: string;

  @IsString()
  @IsNotEmpty()
  studentCode: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(8)
  semester: number;

  @IsString()
  @IsNotEmpty()
  className: string;

  @IsOptional()
  @IsString()
  cvUrl?: string;
}
