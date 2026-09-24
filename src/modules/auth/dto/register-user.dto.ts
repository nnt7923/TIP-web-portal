import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Trim()
  fullName: string;

  @IsEmail()
  @Trim()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Trim()
  phone?: string;
}
