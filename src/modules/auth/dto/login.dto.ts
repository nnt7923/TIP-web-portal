import { Trim } from '../../../common/decorators/validation.decorators';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Trim()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
