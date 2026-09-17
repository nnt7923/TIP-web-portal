import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateMajorDto {
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  name?: string;

  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @IsNotEmpty()
  code?: string;
}
