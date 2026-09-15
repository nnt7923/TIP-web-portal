import { IsOptional, IsString } from 'class-validator';

export class QueryMajorDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}
