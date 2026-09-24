import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';
import { RegisterUserDto } from './register-user.dto';

export class RegisterUniversityDto extends RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Trim()
  universityName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Trim()
  universityCode: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Trim()
  address?: string;
}
