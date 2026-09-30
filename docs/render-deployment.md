# Deploy the backend to Render with Resend

The Node.js API uses Neon PostgreSQL, Upstash Redis, Cloudinary uploads and
Resend HTTPS email delivery. The previous Render service was deleted; create
a new service and use its actual URL when configuring the frontend.

## Before deploying

1. Add a domain you own to Resend and publish its required DNS records.
2. Wait for Resend to mark the sending domain as verified.
3. Set `RESEND_API_KEY` and `RESEND_FROM` in the ignored backend `.env`.
   A sender may look like `TIP Portal <no-reply@your-domain.example>`.
4. Make Render access available through login or a locally stored
   `RENDER_API_KEY`; provide Vercel access to update its environment afterward.

Do not deploy public registration before the domain is verified.
The `onboarding@resend.dev` sender only supports testing to the email associated
with the Resend account. Keep API keys out of Git, logs and frontend public
variables. A sending-only Resend key scoped to the domain is sufficient at runtime.

## Render service

Use `render.yaml` or configure a Node Web Service manually:

- Repository: `https://github.com/nnt7923/TIP-web-portal`, branch `main`.
- Name: `tip-web-portal-api`; Free plan; Ohio region; Node `22.22.0`.
- Build: `npm ci --include=dev && npm run db:generate && npm run build`.
- Start: `npm run db:deploy && npm run start:prod`.
- Health check: `/health`; automatic deployment disabled.

Upload only the runtime variables declared in the Blueprint. Preserve the
existing database URLs, Redis, JWT, origin secret and Cloudinary credentials.
If `JWT_REFRESH_SECRET` was previously absent, leave it empty to retain the
existing fallback behavior. Never upload Render/Vercel management tokens or
legacy SMTP credentials to the service. Render supplies `PORT`; the API listens
on `0.0.0.0`. Migrations run before startup; no reset or seed is required.

Production startup requires `RESEND_API_KEY` and `RESEND_FROM`. Email requests
use HTTPS, time out after eight seconds and are not automatically retried.
Provider acceptance is not proof of inbox delivery. Logs contain only a safe
failure category or HTTP status, never OTPs, recipients or response bodies.

## Frontend and verification

After the Render deployment is healthy, set Vercel's server-only
`BACKEND_API_URL` to the new service URL and `BACKEND_ORIGIN_SECRET` to the
backend `ORIGIN_SECRET`, then redeploy the frontend. Keep localhost settings
for local development unless testing the deployed backend intentionally.

Verify `/health` returns 200 and database/Redis are `up`; protected routes must
reject requests missing `X-Secret`, and `/auth/me` must still require a user
token. Health checks do not send email or prove email delivery.

The owner then tests registration, inbox/spam delivery, OTP verification,
login, resend and password reset using their own test account. If registration
reports `otpSent: false`, use resend instead of registering the same account
again. Retain each registration flow's existing failure recovery behavior.

Render Free sleeps after 15 minutes idle and can take about a minute to wake.
Public frontend auth actions first check `/health` with a bounded timeout;
when unavailable, they ask the user to retry without submitting the mutation.
They never automatically repeat registration or OTP requests.

References: https://render.com/docs/free,
https://resend.com/docs/api-reference/emails/send-email,
https://resend.com/docs/knowledge-base/403-error-resend-dev-domain.
