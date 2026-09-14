import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeTokenDto {
  @ApiProperty({ description: 'Access or refresh token to revoke.' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
