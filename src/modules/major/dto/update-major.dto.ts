import { IsString, IsOptional } from 'class-validator';

export class UpdateMajorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;
}
