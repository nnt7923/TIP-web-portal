import { Trim } from '../../../common/decorators/validation.decorators';
import { IsOptional, IsString, IsUrl, IsNotEmpty } from 'class-validator';

export class CreateUniversityDto {
  @IsString()
  @IsNotEmpty()
  @Trim()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Trim()
  code: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  @Trim()
  address?: string;

  @IsOptional()
  @IsString()
  @Trim()
  logoUrl?: string;
}
