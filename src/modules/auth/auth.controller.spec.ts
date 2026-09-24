import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth-guard';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

describe('Auth controller contract', () => {
  it('keeps authentication on account and password mutation endpoints', () => {
    for (const name of [
      'me',
      'logout',
      'logoutAll',
      'changePassword',
      'revokeToken',
    ] as const) {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Only inspecting guard metadata; the method is not invoked.
        AuthController.prototype[name],
      ) as unknown[];
      expect(guards).toContain(JwtAuthGuard);
    }
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AuthController) as unknown[],
    ).toContain(AuthRateLimitGuard);
  });

  it('me exposes only public account fields', () => {
    const controller = new AuthController({} as AuthService);
    const user = {
      id: 'user',
      username: 'person',
      email: 'person@example.test',
      fullName: 'Person',
      globalRole: 'USER',
      status: 'ACTIVE',
      passwordHash: 'never-return',
    } as unknown as CurrentUserData;
    const result = controller.me(user);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('accessToken');
    expect(result).toMatchObject({ id: 'user', globalRole: 'USER' });
  });
});
