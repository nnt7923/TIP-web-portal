import { Trim } from '../../../common/decorators/validation.decorators';
import { SchoolUserRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateSchoolUserDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  universityId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Trim()
  fullName: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @Trim()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Trim()
  username: string;

  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Trim()
  phone: string;

  @ApiProperty({ enum: SchoolUserRole, enumName: 'SchoolUserRole' })
  @IsEnum(SchoolUserRole)
  role: SchoolUserRole;
}
