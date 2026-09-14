import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OtpPurpose } from '../enums/otp-purpose.enum';

export class ResendOtpDto {
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

  @ApiPropertyOptional({
    enum: OtpPurpose,
    enumName: 'OtpPurpose',
    default: OtpPurpose.EmailVerification,
    description:
      'email_verification verifies a newly registered account. password_reset is for forgot/reset password.',
  })
  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose = OtpPurpose.EmailVerification;
}
