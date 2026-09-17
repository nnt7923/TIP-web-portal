import { Trim } from '../../../common/decorators/validation.decorators';
import { SchoolUserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsUUID()
  universityId: string;

  @IsString()
  @IsNotEmpty()
  @Trim()
  fullName: string;

  @IsEmail()
  @Trim()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Trim()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  @Trim()
  phone: string;

  @IsEnum(SchoolUserRole)
  role: SchoolUserRole;
}
