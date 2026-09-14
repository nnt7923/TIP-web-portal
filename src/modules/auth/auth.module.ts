import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailModule } from '../../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GlobalRolesGuard } from './guards/global-roles.guard';
import { JwtAuthGuard } from './guards/jwt-auth-guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SchoolRolesGuard } from './guards/school-roles.guard';

@Module({
  imports: [
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<JwtSignOptions['expiresIn']>(
            'JWT_EXPIRES_IN',
            '15m',
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    GlobalRolesGuard,
    SchoolRolesGuard,
  ],
  exports: [
    JwtModule,
    AuthService,
    JwtAuthGuard,
    GlobalRolesGuard,
    SchoolRolesGuard,
  ],
})
export class AuthModule {}
