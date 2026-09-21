import { Trim } from '../../../common/decorators/validation.decorators';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @Trim()
  name: string;

  @IsOptional()
  @IsUrl()
  @Trim()
  website?: string;

  @IsOptional()
  @IsString()
  @Trim()
  address?: string;

  @IsOptional()
  @IsString()
  @Trim()
  industry?: string;

  @IsOptional()
  @IsUrl()
  @Trim()
  logoUrl?: string;
}
