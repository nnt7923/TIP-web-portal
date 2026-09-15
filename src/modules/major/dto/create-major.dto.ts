import { IsString, IsNotEmpty } from 'class-validator';

export class CreateMajorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
