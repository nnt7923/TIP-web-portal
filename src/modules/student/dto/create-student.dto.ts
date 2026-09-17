import { Trim } from '../../../common/decorators/validation.decorators';
import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  Max,
  IsUUID,
  IsEmail,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  @Trim()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @Trim()
  username: string;

  @IsEmail()
  @Trim()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  @Trim()
  phone?: string;

  @IsUUID()
  majorId: string;

  @IsString()
  @IsNotEmpty()
  @Trim()
  studentCode: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(8)
  semester: number;

  @IsString()
  @IsNotEmpty()
  @Trim()
  className: string;

  @IsOptional()
  @IsString()
  @Trim()
  cvUrl?: string;
}
