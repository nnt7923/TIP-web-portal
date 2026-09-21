import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';

export class RegisterCompanyDto {
  @ApiProperty({ example: 'TIP Technology' })
  @IsString()
  @IsNotEmpty()
  @Trim()
  companyName: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  @Trim()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Trim()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Trim()
  industry?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  @Trim()
  logoUrl?: string;

  @ApiProperty({ example: 'Nguyen Van A' })
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
  @MinLength(8)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Trim()
  phone?: string;
}
