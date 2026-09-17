import { Trim } from '../../../common/decorators/validation.decorators';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateMajorDto {
  @IsString()
  @IsNotEmpty()
  @Trim()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Trim()
  code: string;
}
