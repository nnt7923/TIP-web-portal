# Deploy the backend to Render

The service runs NestJS directly with Node.js. PostgreSQL stays on Neon, Redis stays on Upstash, and uploads stay on Cloudinary.

## Service configuration

Use `render.yaml` in the repository root, or create a Node Web Service with:

- Repository: `https://github.com/nnt7923/TIP-web-portal`
- Branch: `main`
- Region: Ohio (near the existing Neon database)
- Plan: Free
- Build: `npm ci --include=dev && npm run db:generate && npm run build`
- Start: `npm run db:deploy && npm run start:prod`
- Health check: `/health`

The start command applies committed migrations before opening the HTTP port. Migration failure stops startup. Render supplies `PORT`; Nest listens on `0.0.0.0`. Do not copy the local `PORT` variable to Render.

Set the environment variables declared in `render.yaml` using the backend's local `.env`. Never commit environment files or put secret values in the Blueprint. `DATABASE_URL` is the pooled Neon connection; `DATABASE_URL_UNPOOLED` is the direct connection for migrations. Preserve `JWT_REFRESH_SECRET` too if it is configured locally.

`ORIGIN_SECRET` protects API routes except the read-only `GET /health` check. The Next.js server forwards the matching `BACKEND_ORIGIN_SECRET` as `X-Secret`, alongside each user's bearer token.

## Email on the free plan

Render Free blocks outgoing SMTP on ports 25, 465 and 587. Set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, and `BREVO_SENDER_EMAIL` to send OTP over Brevo's HTTPS API. The sender must be verified in Brevo and transactional sending must be enabled. `BREVO_SENDER_NAME` defaults to `TIP Web Portal`. Existing SMTP environments keep working with `EMAIL_PROVIDER=smtp` (the default).

Use an API key from Brevo Settings → SMTP & API → API Keys, not an SMTP key. Keep deployment credentials such as `RENDER_API_KEY` only on your machine; never upload them into the running service.

Free instances also sleep after 15 minutes without incoming traffic. The first request may take about a minute to wake the service, exceeding the frontend's normal request timeout; retry after startup.

References: https://render.com/docs/free and https://render.com/docs/blueprint-spec

## Switch the frontend

After verifying the deployed service, set `BACKEND_API_URL` in the frontend environment to the Render service URL and keep `BACKEND_ORIGIN_SECRET` equal to `ORIGIN_SECRET`. Restart the frontend. Do not change its backend URL before the Render health check succeeds.

Verify `/health` returns 200 with database/Redis `up`, protected routes return 401 without `X-Secret`, and `/auth/me` still returns 401 without a user token even with a valid origin secret.
