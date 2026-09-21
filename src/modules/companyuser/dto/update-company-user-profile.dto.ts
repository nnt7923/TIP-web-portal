import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class UpdateCompanyUserProfileDto {
  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @Trim()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  phone?: string;
}
