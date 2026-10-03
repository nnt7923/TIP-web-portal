import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';

/** Only our authenticated web server can relay a visitor's identity. */
export function clientIp(request: Request, secret?: string): string {
  const supplied = Buffer.from(request.get('x-secret') || '');
  const expected = Buffer.from(secret || '');
  const forwarded = request.get('x-tip-client-ip') || '';
  if (
    expected.length > 0 &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected) &&
    isIP(forwarded)
  )
    return forwarded;
  // Vercel overwrites this header at ingress. Do not trust it on local Node.
  const platformIp = request.get('x-forwarded-for') || '';
  if (process.env.VERCEL === '1' && isIP(platformIp)) return platformIp;
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}
