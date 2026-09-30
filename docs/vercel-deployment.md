# Deploy the NestJS API to Vercel

Use a separate `tip-web-portal-api` project in the same Vercel account as the
existing frontend. `vercel.json` selects NestJS, `iad1`, a 60-second duration,
Prisma generation during installation and the Nest build command. Node 22 is
selected in `package.json`. Vercel detects `src/main.ts` directly; keep the
normal Nest entrypoint and decorator metadata. Database and Redis connections
are shared by requests within each application instance.

## Required environment

Set runtime variables in the backend project only:

- `NODE_ENV=production`
- `DATABASE_URL` (Neon pooled), `DATABASE_URL_UNPOOLED` (direct)
- `REDIS_URL` (Upstash TLS)
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- `JWT_REFRESH_SECRET` only if already configured; preserve existing secrets
- `ORIGIN_SECRET` matching the frontend's `BACKEND_ORIGIN_SECRET`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`
- `SMTP_USER` (Gmail address), `SMTP_PASS` (Gmail app password)
- `SMTP_FROM` optionally overrides the default `SMTP_USER` sender

Keep `VERCEL_TOKEN` and any management credentials local. Never expose them in
the runtime, Git, logs or `NEXT_PUBLIC_*`. Ignore `.vercel` locally. SMTP requires
STARTTLS on 587 or TLS on 465, has an eight-second total deadline, and does not
retry automatically. An SMTP acceptance is not proof of inbox delivery.

## Deployment sequence

1. Authenticate with `vercel login` or a locally stored token and select the
   frontend owner's workspace. Link/create the backend project.
2. Check `npx prisma migrate status` against the intended Neon database without
   printing its connection URL. Apply only missing committed migrations with
   `npm run db:deploy` as a separate release step. Never migrate or seed inside
   a function or during preview builds.
3. Configure production variables, build and deploy. Check Prisma native engine
   inclusion, startup, health and origin/JWT enforcement on the actual deployment.
   Production API must be reachable by the frontend server; keep application
   authentication even when Vercel deployment protection is not used in production.
4. After backend health succeeds, update the frontend production
   `BACKEND_API_URL` to the backend's actual production URL, keep the matching
   origin secret, and redeploy frontend. Local development keeps localhost.
5. The owner tests registration, OTP inbox/spam delivery, verification, login,
   resend and password reset. Do not claim delivery before this confirmation.

The old Render service was deleted. Do not create a new Render service; if one
was recreated independently, verify it belongs to this repository before removal.
Neon, Upstash and Cloudinary data are retained. No domain purchase is required.

## Upload limits and validation

Each image/PDF may contain at most 4 MiB (4,194,304 bytes), including the exact
boundary. Frontend Server Actions allow `4.4mb` for multipart framing within
Vercel's 4.5 MB request limit. Larger payloads can still fail at the platform
layer before application validation. Test actual multipart uploads through
Vercel. Keep existing file-type and authorization checks.

Public auth checks `/health` before submitting mutations. A failed health check
returns a readiness message without submitting or retrying the mutation. Health
checks report database and Redis status, not SMTP delivery.

References: https://vercel.com/docs/frameworks/backend/nestjs,
https://vercel.com/kb/guide/serverless-functions-and-smtp,
https://vercel.com/docs/functions/limitations.
