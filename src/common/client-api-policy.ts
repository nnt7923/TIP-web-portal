import { RequestMethod, type Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { MetadataScanner } from '@nestjs/core';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth-guard';

const publicRoutes: [string, string][] = [
  ['GET', '/health'],
  ['GET', '/public/opportunities'],
  ['GET', '/universities'],
  ['GET', '/universities/:id'],
  ['GET', '/companies'],
  ['GET', '/companies/:id'],
  ...[
    'login',
    'register',
    'register-user',
    'register-university',
    'register-company',
    'resend-otp',
    'verify-otp',
    'refresh-token',
    'reset-password',
  ].map((action): [string, string] => ['POST', `/auth/${action}`]),
];

function routePattern(path: string): RegExp {
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((part) =>
      part.startsWith(':')
        ? '[^/]+'
        : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
  return new RegExp(`^/${parts.join('/')}/?$`, 'i');
}

/** Only public routes and routes already guarded by JWT can bypass X-Secret. */
export function createClientApiPolicy(controllers: Iterable<Type<unknown>>) {
  const publicKeys = new Set(
    publicRoutes.map(([method, path]) => `${method} ${path}`),
  );
  const routes: { method: string; pattern: RegExp; client: boolean }[] = [];
  const scanner = new MetadataScanner();
  for (const controller of controllers) {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as
      string | undefined;
    if (typeof prefix !== 'string') continue;
    const classGuards =
      (Reflect.getMetadata(GUARDS_METADATA, controller) as
        unknown[] | undefined) ?? [];
    const prototype = controller.prototype as object;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler: unknown = Reflect.get(prototype, name);
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as
        string | undefined;
      const guards =
        (Reflect.getMetadata(GUARDS_METADATA, handler) as
          unknown[] | undefined) ?? [];
      if (method === undefined || typeof path !== 'string') continue;
      const routePath = `/${prefix}/${path}`
        .split('/')
        .filter(Boolean)
        .join('/');
      routes.push({
        method: RequestMethod[method],
        pattern: routePattern(`/${routePath}`),
        client:
          [...classGuards, ...guards].includes(JwtAuthGuard) ||
          publicKeys.has(`${RequestMethod[method]} /${routePath}`),
      });
    }
  }
  return (method: string, path: string): boolean => {
    const verb = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
    // Preserve registration order: an unguarded internal handler cannot inherit
    // access merely because a later JWT route has a matching parameter pattern.
    return (
      routes.find(
        (route) =>
          (route.method === verb || route.method === 'ALL') &&
          route.pattern.test(path),
      )?.client === true
    );
  };
}
