import { timingSafeEqual } from 'node:crypto';
import { createBackendApp } from './dist/bootstrap.js';

// This entry is copied to the deployment root; Nest's compiled files stay in dist/.
const secret = process.env.ORIGIN_SECRET;
if (!secret) throw new Error('ORIGIN_SECRET is required');
const expected = Buffer.from(secret);
let boot;

function authorized(request) {
  const supplied = request.headers.get('x-secret');
  if (!supplied) return false;
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function getOrigin() {
  if (!boot) {
    boot = (async () => {
      const app = await createBackendApp();
      try {
        // Keep the existing Express/Nest request handling, including multipart and guards.
        await app.listen(0, '127.0.0.1');
        const address = app.getHttpServer().address();
        return `http://127.0.0.1:${address.port}`;
      } catch (error) {
        await app.close();
        throw error;
      }
    })().catch((error) => {
      boot = undefined;
      throw error;
    });
  }
  return boot;
}

export default {
  async fetch(request) {
    if (!authorized(request))
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    const incoming = new URL(request.url);
    const url = new URL(await getOrigin());
    url.pathname = incoming.pathname;
    url.search = incoming.search;
    const headers = new Headers(request.headers);
    for (const name of [
      'host',
      'connection',
      'transfer-encoding',
      'content-length',
    ])
      headers.delete(name);
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      duplex: 'half',
      redirect: 'manual',
      signal: request.signal,
    });
    const responseHeaders = new Headers(response.headers);
    // fetch may decompress the upstream response; do not retain stale length/encoding.
    for (const name of [
      'content-encoding',
      'content-length',
      'transfer-encoding',
      'connection',
    ])
      responseHeaders.delete(name);
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  },
};
