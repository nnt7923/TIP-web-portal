import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateMajorDto {
  @IsUUID()
  universityId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
