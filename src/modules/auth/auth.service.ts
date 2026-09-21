import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  AccountStatus,
  CompanyStatus,
  CompanyUserRole,
  CompanyUserStatus,
  GlobalRole,
  Prisma,
  SchoolUserRole,
  SchoolUserStatus,
} from '@prisma/client';
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../../email/email.service';
import { RedisService } from '../../redis/redis.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { ResendOtpDto } from './dto/resend.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpPurpose } from './enums/otp-purpose.enum';
import { TokenType } from './enums/token-type.enum';
import type { JwtPayload } from './guards/jwt-auth-guard';
import { normalizeOptionalText } from '../../common/utils/text.util';

import {
  authProfileInclude,
  assertAccountCanAuthenticate,
} from './auth-account.policy';
import {
  SAVE_SESSION,
  REMOVE_ALL_SESSIONS,
  CONSUME_OTP,
  RATE_LIMIT,
} from './redis-scripts';

const scryptAsync = promisify(scrypt);
const OTP_TTL_SECONDS = 5 * 60;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 10 * 60;

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type TokenAccount = {
  id: string;
  username: string;
  globalRole: GlobalRole;
  student: { universityId: string } | null;
  schoolUser: {
    universityId: string;
    role: SchoolUserRole;
  } | null;
  companyUser: {
    companyId: string;
    role: CompanyUserRole;
  } | null;
};

const companyRegistrationAccountSelect = {
  id: true,
  fullName: true,
  email: true,
  username: true,
  phone: true,
  globalRole: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  companyUser: {
    select: {
      id: true,
      companyId: true,
      role: true,
      status: true,
      company: true,
    },
  },
} satisfies Prisma.AccountSelect;

type CompanyRegistrationAccount = Prisma.AccountGetPayload<{
  select: typeof companyRegistrationAccountSelect;
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthTokens> {
    const loginKey = createHash('sha256')
      .update(loginDto.username.trim().toLowerCase())
      .digest('hex');
    const attempts = await this.redisService.connection.eval(
      RATE_LIMIT,
      1,
      `auth:rate:login:${loginKey}`,
      300,
    );
    if (Number(attempts) > 10)
      throw new HttpException(
        'Too many login attempts. Try again in five minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const account = await this.prisma.account.findUnique({
      where: { username: loginDto.username.trim() },
      include: authProfileInclude,
    });

    if (!account) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const isPasswordValid = await this.verifyPassword(
      loginDto.password,
      account.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    this.assertAccountCanLogin(account);

    await this.prisma.account.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(account);
  }

  async register(registerDto: RegisterDto) {
    const username = registerDto.username.trim();
    const email = registerDto.email.trim().toLowerCase();

    const university = await this.prisma.university.findUnique({
      where: { id: registerDto.universityId },
      select: { id: true },
    });

    if (!university) {
      throw new NotFoundException('University was not found');
    }

    const existingAccount = await this.prisma.account.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { id: true },
    });

    if (existingAccount) {
      throw new ConflictException('Username or email is already registered');
    }

    const account = await this.prisma.account.create({
      data: {
        fullName: registerDto.fullName.trim(),
        email,
        username,
        passwordHash: await this.hashPassword(registerDto.password),
        phone: registerDto.phone.trim(),
        globalRole: GlobalRole.USER,
        status: AccountStatus.ACTIVE,
        schoolUser: {
          create: {
            universityId: registerDto.universityId,
            role: registerDto.role,
            status: SchoolUserStatus.PENDING,
          },
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        username: true,
        phone: true,
        globalRole: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        schoolUser: {
          select: {
            id: true,
            universityId: true,
            role: true,
            status: true,
          },
        },
      },
    });

    try {
      await this.sendOtp(
        account.id,
        account.email,
        OtpPurpose.EmailVerification,
      );
    } catch (error) {
      await this.prisma.account.delete({ where: { id: account.id } });
      throw error;
    }

    return {
      message:
        'Registration successful. Verify your email, then wait for admin approval.',
      account,
    };
  }

  async registerCompany(dto: RegisterCompanyDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    const existingAccount = await this.prisma.account.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { id: true },
    });

    if (existingAccount) {
      throw new ConflictException('Username or email is already registered');
    }

    let account: CompanyRegistrationAccount;
    try {
      account = await this.prisma.account.create({
        data: {
          fullName: dto.fullName.trim(),
          email,
          username,
          passwordHash: await this.hashPassword(dto.password),
          phone: normalizeOptionalText(dto.phone),
          globalRole: GlobalRole.USER,
          status: AccountStatus.ACTIVE,
          companyUser: {
            create: {
              role: CompanyUserRole.COMPANY_ADMIN,
              status: CompanyUserStatus.PENDING,
              company: {
                create: {
                  name: dto.companyName.trim(),
                  website: normalizeOptionalText(dto.website),
                  address: normalizeOptionalText(dto.address),
                  industry: normalizeOptionalText(dto.industry),
                  logoUrl: normalizeOptionalText(dto.logoUrl),
                  status: CompanyStatus.PENDING,
                },
              },
            },
          },
        },
        select: companyRegistrationAccountSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Username or email is already registered');
      }
      throw error;
    }

    try {
      await this.sendOtp(
        account.id,
        account.email,
        OtpPurpose.EmailVerification,
      );
    } catch (error) {
      await this.prisma.$transaction([
        this.prisma.account.delete({ where: { id: account.id } }),
        this.prisma.company.delete({
          where: { id: account.companyUser!.companyId },
        }),
      ]);
      throw error;
    }

    return {
      message:
        'Company registration submitted. Verify the email and wait for System Admin approval.',
      account,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const purpose = dto.purpose ?? OtpPurpose.EmailVerification;
    const account = await this.findAccountByEmail(dto.email, dto.universityId);

    if (!account) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (purpose === OtpPurpose.EmailVerification && account.emailVerifiedAt) {
      return { message: 'Email is already verified.' };
    }

    const isValid = await this.consumeOtp(account.id, purpose, dto.otp);

    if (!isValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.redisService.connection.del(
      this.otpCooldownKey(account.id, purpose),
    );

    if (purpose === OtpPurpose.EmailVerification) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { emailVerifiedAt: new Date() },
      });

      return {
        message: 'Email verified. You can log in once your profile is active.',
      };
    }

    const resetToken = randomBytes(32).toString('hex');
    await this.redisService.connection.set(
      this.passwordResetKey(resetToken),
      account.id,
      'EX',
      PASSWORD_RESET_TOKEN_TTL_SECONDS,
    );

    return {
      message: 'OTP verified. Use the reset token to set a new password.',
      resetToken,
    };
  }

  async resendOtp(dto: ResendOtpDto) {
    const purpose = dto.purpose ?? OtpPurpose.EmailVerification;
    const account = await this.findAccountByEmail(dto.email, dto.universityId);

    if (!account) {
      return { message: 'If the email exists, a new OTP has been sent.' };
    }

    if (purpose === OtpPurpose.EmailVerification && account.emailVerifiedAt) {
      return { message: 'Email is already verified.' };
    }

    await this.sendOtp(account.id, account.email, purpose);

    return { message: 'If the email exists, a new OTP has been sent.' };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifySignedToken(
      refreshToken,
      TokenType.Refresh,
    );
    const session = await this.redisService.connection.hgetall(
      this.sessionKey(payload.sid),
    );
    const sessionAccountId = session.accountId ?? session.userId;

    if (
      sessionAccountId !== payload.sub ||
      session.refreshJti !== payload.jti
    ) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
      include: authProfileInclude,
    });

    if (!account) {
      await this.removeSession(payload.sub, payload.sid);
      throw new UnauthorizedException('Invalid or inactive account');
    }

    try {
      this.assertAccountCanLogin(account);
    } catch {
      await this.removeSession(payload.sub, payload.sid);
      throw new UnauthorizedException('Invalid or inactive account');
    }

    return this.issueTokens(account, payload.sid, payload.jti);
  }

  async logout(accountId: string, accessToken: string) {
    const payload = await this.verifySignedToken(accessToken, TokenType.Access);
    this.assertTokenOwner(payload, accountId);

    await Promise.all([
      this.blacklistToken(payload),
      this.removeSession(accountId, payload.sid),
    ]);

    return { message: 'Logged out successfully.' };
  }

  async logoutAll(accountId: string) {
    await this.removeAllSessions(accountId);
    return { message: 'Logged out from all devices successfully.' };
  }

  async revokeToken(accountId: string, token: string) {
    let payload: JwtPayload;

    try {
      payload = await this.verifySignedToken(token, TokenType.Access);
    } catch {
      payload = await this.verifySignedToken(token, TokenType.Refresh);
    }

    this.assertTokenOwner(payload, accountId);

    if (payload.tokenType === TokenType.Access) {
      await this.blacklistToken(payload);
    } else {
      await this.removeSession(accountId, payload.sid);
    }

    return { message: 'Token revoked successfully.' };
  }

  async changePassword(accountId: string, dto: ChangePasswordDto) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { passwordHash: true },
    });

    if (!account) {
      throw new NotFoundException('Account was not found');
    }

    const isCurrentPasswordValid = await this.verifyPassword(
      dto.currentPassword,
      account.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.prisma.account.update({
      where: { id: accountId },
      data: { passwordHash: await this.hashPassword(dto.newPassword) },
    });
    await this.removeAllSessions(accountId);

    return {
      message: 'Password changed. Please log in again on all devices.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const accountId = await this.readPasswordResetToken(dto.resetToken);

    if (!accountId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, passwordHash: true },
    });

    if (!account) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const isSamePassword = await this.verifyPassword(
      dto.newPassword,
      account.passwordHash,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const tokenWasConsumed = await this.consumePasswordResetToken(
      dto.resetToken,
      account.id,
    );

    if (!tokenWasConsumed) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { passwordHash: await this.hashPassword(dto.newPassword) },
    });
    await this.removeAllSessions(account.id);

    return {
      message: 'Password reset successfully. Please log in again.',
    };
  }

  /** Creates a salted scrypt hash for safe password storage. */
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /** Compares a plain password with the stored salt:hash value. */
  private async verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    const separatorIndex = passwordHash.indexOf(':');
    if (separatorIndex <= 0) return false;

    const salt = passwordHash.slice(0, separatorIndex);
    const storedKeyHex = passwordHash.slice(separatorIndex + 1);
    if (!storedKeyHex || !/^[a-f\d]+$/i.test(storedKeyHex)) return false;

    const storedKey = Buffer.from(storedKeyHex, 'hex');
    if (storedKey.length === 0) return false;

    const derivedKey = (await scryptAsync(
      password,
      salt,
      storedKey.length,
    )) as Buffer;

    return (
      derivedKey.length === storedKey.length &&
      timingSafeEqual(derivedKey, storedKey)
    );
  }

  /** Kiểm tra chung cho SchoolUser và Student. */
  private assertAccountCanLogin(
    account: Parameters<typeof assertAccountCanAuthenticate>[0],
  ): void {
    assertAccountCanAuthenticate(account);
  }

  /** Sends a six-digit OTP and stores it in Redis for five minutes. */
  private async sendOtp(
    accountId: string,
    email: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const otp = randomInt(100000, 1000000).toString();
    const reservationId = randomUUID();
    const redisKey = this.otpKey(accountId, purpose);
    const cooldownKey = this.otpCooldownKey(accountId, purpose);

    const reservation = await this.redisService.connection.set(
      cooldownKey,
      reservationId,
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (!reservation)
      throw new HttpException(
        'Please wait before requesting another OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.redisService.connection
      .multi()
      .set(
        redisKey,
        createHash('sha256').update(otp).digest('hex'),
        'EX',
        OTP_TTL_SECONDS,
      )
      .del(`${redisKey}:attempts`)
      .exec();

    try {
      await this.emailService.sendOtp(email, otp);
    } catch (error) {
      await this.redisService.connection.eval(
        "if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[1], KEYS[2], KEYS[3]) end; return 1",
        3,
        redisKey,
        cooldownKey,
        `${redisKey}:attempts`,
        reservationId,
      );
      throw error;
    }
  }

  /** Finds the global Account for an email and optionally checks its university. */
  private async findAccountByEmail(emailValue: string, universityId?: string) {
    const account = await this.prisma.account.findUnique({
      where: { email: emailValue.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        schoolUser: { select: { universityId: true } },
        student: { select: { universityId: true } },
        companyUser: { select: { companyId: true } },
      },
    });

    if (
      account &&
      universityId &&
      (account.schoolUser?.universityId ?? account.student?.universityId) !==
        universityId
    ) {
      return null;
    }

    return account;
  }

  /** Atomically validates and consumes an OTP so it cannot be reused. */
  private async consumeOtp(
    accountId: string,
    purpose: OtpPurpose,
    otp: string,
  ): Promise<boolean> {
    const result: unknown = await this.redisService.connection.eval(
      CONSUME_OTP,
      2,
      this.otpKey(accountId, purpose),
      `${this.otpKey(accountId, purpose)}:attempts`,
      createHash('sha256').update(otp).digest('hex'),
      5,
    );
    return result === 1;
  }

  /** Issues an access/refresh pair and records the Account session in Redis. */
  private async issueTokens(
    account: TokenAccount,
    existingSessionId?: string,
    expectedRefreshJti?: string,
  ): Promise<AuthTokens> {
    const sessionId = existingSessionId ?? randomUUID();
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const basePayload = {
      sub: account.id,
      username: account.username,
      globalRole: account.globalRole,
      schoolRole: account.schoolUser?.role,
      companyRole: account.companyUser?.role,
      universityId:
        account.schoolUser?.universityId ?? account.student?.universityId,
      companyId: account.companyUser?.companyId,
      sid: sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, jti: accessJti, tokenType: TokenType.Access },
        {
          secret: this.accessTokenSecret,
          expiresIn: this.accessTokenExpiresIn,
        },
      ),
      this.jwtService.signAsync(
        { ...basePayload, jti: refreshJti, tokenType: TokenType.Refresh },
        {
          secret: this.refreshTokenSecret,
          expiresIn: this.refreshTokenExpiresIn,
        },
      ),
    ]);

    const refreshPayload = await this.jwtService.verifyAsync<JwtPayload>(
      refreshToken,
      { secret: this.refreshTokenSecret },
    );
    const sessionTtl = Math.max(
      (refreshPayload.exp ?? Math.floor(Date.now() / 1000) + 1) -
        Math.floor(Date.now() / 1000),
      1,
    );
    const sessionKey = this.sessionKey(sessionId);
    const accountSessionsKey = this.accountSessionsKey(account.id);

    const saved = await this.redisService.connection.eval(
      SAVE_SESSION,
      2,
      sessionKey,
      accountSessionsKey,
      account.id,
      refreshJti,
      sessionTtl,
      sessionId,
      expectedRefreshJti ?? '',
    );
    if (saved !== 1)
      throw new UnauthorizedException(
        'Refresh token has been revoked or already used',
      );

    return { accessToken, refreshToken };
  }

  /** Verifies a signed JWT and ensures it has the expected token type. */
  private async verifySignedToken(
    token: string,
    expectedType: TokenType,
  ): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret:
          expectedType === TokenType.Access
            ? this.accessTokenSecret
            : this.refreshTokenSecret,
      });

      if (
        payload.tokenType !== expectedType ||
        !payload.sub ||
        !payload.sid ||
        !payload.jti
      ) {
        throw new Error('Invalid token payload');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /** Revokes one access token until its natural expiration time. */
  private async blacklistToken(payload: JwtPayload): Promise<void> {
    const remainingSeconds = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);

    if (remainingSeconds > 0) {
      await this.redisService.connection.set(
        this.revokedTokenKey(payload.jti),
        '1',
        'EX',
        remainingSeconds,
      );
    }
  }

  /** Deletes one login session and removes it from the Account session set. */
  private async removeSession(
    accountId: string,
    sessionId: string,
  ): Promise<void> {
    await this.redisService.connection
      .multi()
      .del(this.sessionKey(sessionId))
      .srem(this.accountSessionsKey(accountId), sessionId)
      .exec();
  }

  /** Deletes every active login session owned by one Account. */
  private async removeAllSessions(accountId: string): Promise<void> {
    const accountSessionsKey = this.accountSessionsKey(accountId);
    await this.redisService.connection.eval(
      REMOVE_ALL_SESSIONS,
      1,
      accountSessionsKey,
      'auth:session:',
    );
  }

  /** Reads the Account id stored for a password reset token. */
  private async readPasswordResetToken(token: string): Promise<string | null> {
    return this.redisService.connection.get(this.passwordResetKey(token));
  }

  /** Atomically consumes a one-time password reset token. */
  private async consumePasswordResetToken(
    token: string,
    expectedAccountId: string,
  ): Promise<boolean> {
    const result: unknown = await this.redisService.connection.eval(
      "local value = redis.call('GET', KEYS[1]); if not value or value ~= ARGV[1] then return 0 end; redis.call('DEL', KEYS[1]); return 1",
      1,
      this.passwordResetKey(token),
      expectedAccountId,
    );
    return result === 1;
  }

  /** Ensures a token can only be managed by its owning Account. */
  private assertTokenOwner(payload: JwtPayload, accountId: string): void {
    if (payload.sub !== accountId) {
      throw new ForbiddenException('You cannot revoke another account token');
    }
  }

  private otpKey(accountId: string, purpose: OtpPurpose): string {
    return `otp:${purpose}:${accountId}`;
  }

  private otpCooldownKey(accountId: string, purpose: OtpPurpose): string {
    return `otp:cooldown:${purpose}:${accountId}`;
  }

  private sessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private accountSessionsKey(accountId: string): string {
    return `auth:user-sessions:${accountId}`;
  }

  private revokedTokenKey(jti: string): string {
    return `auth:revoked:${jti}`;
  }

  private passwordResetKey(token: string): string {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return `auth:password-reset:${tokenHash}`;
  }

  private get accessTokenSecret(): string {
    return this.configService.getOrThrow<string>('JWT_SECRET');
  }

  private get refreshTokenSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.accessTokenSecret
    );
  }

  private get accessTokenExpiresIn(): JwtSignOptions['expiresIn'] {
    return this.configService.get<JwtSignOptions['expiresIn']>(
      'JWT_EXPIRES_IN',
      '15m',
    );
  }

  private get refreshTokenExpiresIn(): JwtSignOptions['expiresIn'] {
    return this.configService.get<JwtSignOptions['expiresIn']>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );
  }
}
