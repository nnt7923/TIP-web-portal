import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { OtpPurpose } from '../enums/otp-purpose.enum';

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional additional check for a school account university.',
  })
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'otp must contain exactly 6 digits' })
  otp: string;

  @ApiPropertyOptional({
    enum: OtpPurpose,
    enumName: 'OtpPurpose',
    default: OtpPurpose.EmailVerification,
  })
  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose = OtpPurpose.EmailVerification;
}
