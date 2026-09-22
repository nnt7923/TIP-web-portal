import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { ResendOtpDto } from './dto/resend.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RevokeTokenDto } from './dto/revoke-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth-guard';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@UseGuards(AuthRateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a school user' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the authenticated account' })
  me(@CurrentUser() user: CurrentUserData) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      globalRole: user.globalRole,
      status: user.status,
    };
  }

  @Post('register-company')
  @ApiOperation({ summary: 'Register a pending company and its first admin' })
  registerCompany(@Body() dto: RegisterCompanyDto) {
    return this.authService.registerCompany(dto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend an OTP' })
  resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    return this.authService.resendOtp(resendOtpDto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email or password-reset OTP' })
  verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token and get a new token pair' })
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with a one-time reset token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out the current session' })
  logout(@CurrentUser('id') accountId: string, @Req() request: Request) {
    return this.authService.logout(accountId, this.extractBearerToken(request));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out every session owned by the current user' })
  logoutAll(@CurrentUser('id') accountId: string) {
    return this.authService.logoutAll(accountId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('revoke-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke one access or refresh token' })
  revokeToken(
    @CurrentUser('id') accountId: string,
    @Body() dto: RevokeTokenDto,
  ) {
    return this.authService.revokeToken(accountId, dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the current user password' })
  changePassword(
    @CurrentUser('id') accountId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(accountId, dto);
  }

  /** Reads the access token already validated by JwtAuthGuard. */
  private extractBearerToken(request: Request): string {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token is required');
    }

    return token;
  }
}
