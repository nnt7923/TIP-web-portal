import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SchoolUserStatus } from '@prisma/client';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './guards/jwt-auth-guard';

const scryptAsync = promisify(scrypt);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.schoolUser.findUnique({
      where: { username: loginDto.username.trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const isPasswordValid = await this.verifyPassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (user.status !== SchoolUserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }

  /** So sánh mật khẩu người dùng nhập với chuỗi salt:hash đã lưu bằng scrypt. */
  private async verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    const separatorIndex = passwordHash.indexOf(':');

    if (separatorIndex <= 0) {
      return false;
    }

    const salt = passwordHash.slice(0, separatorIndex);
    const storedKeyHex = passwordHash.slice(separatorIndex + 1);

    if (!storedKeyHex || !/^[a-f\d]+$/i.test(storedKeyHex)) {
      return false;
    }

    const storedKey = Buffer.from(storedKeyHex, 'hex');

    if (storedKey.length === 0) {
      return false;
    }

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
}
