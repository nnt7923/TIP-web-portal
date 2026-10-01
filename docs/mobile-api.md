# Flutter and direct API clients

Base URL: `https://tip-web-portal-api.vercel.app` (no `/api` prefix).

Public requests do not require `X-Secret` or an access token:

- `GET /health`
- `GET /public/opportunities?page=1&limit=6`
- `GET /companies`, `GET /companies/:id`
- `GET /universities`, `GET /universities/:id`
- `POST /auth/login`
- `POST /auth/register`, `/auth/register-user`, `/auth/register-university`,
  `/auth/register-company`
- `POST /auth/resend-otp`, `/auth/verify-otp`, `/auth/reset-password`
- `POST /auth/refresh-token` (requires a valid refresh token in the body)

Send JSON with `Content-Type: application/json`. Login uses `username`, not
`email`: `{ "username": "your-username", "password": "your-password" }`.
Registration still requires OTP and applicable organization approval. Password
reset still requires the one-time reset token. Existing auth rate limits apply.

After login, send `Authorization: Bearer <accessToken>` on routes protected by
`JwtAuthGuard`, including `/auth/me`, profile, applications and management APIs.
Their existing session, account-status, role and organization checks still apply.
An expired/revoked token returns 401; insufficient permissions return 403. Use
`/auth/refresh-token` to rotate tokens and retry a rejected authenticated request
at most once. Do not automatically repeat registration or OTP sends after a
timeout. Store tokens in the platform's secure storage, never log them.

The backend builds its client-route policy from registered controller metadata:
only the explicit public list or a handler/class with `JwtAuthGuard` can bypass
the origin secret. Unguarded new routes, unknown routes and Swagger continue to
require `X-Secret`. Never put `ORIGIN_SECRET` in Flutter. CORS preflight is allowed
for recognized client routes; it does not authorize the actual request.

The Next.js website can continue sending its existing server-side `X-Secret`.
No frontend environment variable, schema or database migration is needed.

CV uploads use multipart field `cv`, PDF only, maximum 4 MiB (4,194,304 bytes).
Let the HTTP client generate the multipart `Content-Type` boundary.

Smoke checks without a secret:

```bash
curl https://tip-web-portal-api.vercel.app/health
curl https://tip-web-portal-api.vercel.app/public/opportunities
curl -X POST https://tip-web-portal-api.vercel.app/auth/login \
  -H 'Content-Type: application/json' -d '{}'
```

The empty login body should return 400 validation errors, not origin-secret 401.
`GET /auth/me` without a token or with a forged token must still return 401.
Swagger without `X-Secret` remains blocked. Validate web login and mobile login,
refresh, profile access and role denial after deploying.
