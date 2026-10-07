import 'reflect-metadata';
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { createClientApiPolicy } from './client-api-policy';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth-guard';

@Controller('auth')
class AuthFixture {
  @Post('login') login() {}
  @Post('register-user') register() {}
  @Get('me') @UseGuards(JwtAuthGuard) me() {}
  @Get('internal') internal() {}
}

@Controller('protected')
@UseGuards(JwtAuthGuard)
class ProtectedFixture {
  @Get() list() {}
  @Post(':id/action') update() {}
}

@Controller('mixed')
class MixedFixture {
  @Get('internal') internal() {}
  @Get(':id') @UseGuards(JwtAuthGuard) guarded() {}
}

describe('Direct client API boundary', () => {
  const allows = createClientApiPolicy([
    AuthFixture,
    ProtectedFixture,
    MixedFixture,
  ]);

  it('allows registered public auth routes without an origin secret', () => {
    expect(allows('POST', '/auth/login')).toBe(true);
    expect(allows('POST', '/auth/register-user/')).toBe(true);
    expect(allows('GET', '/auth/login')).toBe(false);
  });

  it('allows routes with class or method JWT guards for the guards to validate', () => {
    expect(allows('GET', '/auth/me')).toBe(true);
    expect(allows('GET', '/protected')).toBe(true);
    expect(allows('POST', '/protected/uuid/action')).toBe(true);
    expect(allows('DELETE', '/protected/uuid/action')).toBe(false);
  });

  it('keeps unguarded, unknown and documentation routes behind the secret', () => {
    for (const path of [
      '/swagger',
      '/swagger-json',
      '/auth/internal',
      '/auth/unknown',
      '/protected/uuid/action/more',
    ]) {
      expect(allows('GET', path)).toBe(false);
    }
    expect(allows('POST', '/auth/login/other')).toBe(false);
    expect(allows('POST', '/auth/register-company')).toBe(false); // Not registered in this fixture.
  });

  it('does not let a parameterized JWT route expose a preceding internal handler', () => {
    expect(allows('GET', '/mixed/internal')).toBe(false);
    expect(allows('GET', '/mixed/123')).toBe(true);
  });

  it('matches implicit HEAD and case-insensitive Express paths without prefix matching', () => {
    expect(allows('HEAD', '/auth/me')).toBe(true);
    expect(allows('POST', '/AUTH/LOGIN')).toBe(true);
    expect(allows('GET', '/protected-other')).toBe(false);
  });
});
