import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'One-time token returned by verify-otp.' })
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
