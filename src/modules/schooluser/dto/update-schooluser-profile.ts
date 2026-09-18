import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import { IsNotEmpty } from 'class-validator';
import { IsEmail, IsString } from 'class-validator';

export class UpdateSchoolUserProfileDto {
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  fullName?: string;

  @IsOptionalNotNull()
  @IsEmail()
  @Trim()
  email?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  phone?: string;

  @IsOptionalNotNull()
  @IsString()
  password?: string;
}
