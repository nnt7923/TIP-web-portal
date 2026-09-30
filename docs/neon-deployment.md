# Deploy TIP API to Neon

Project: `soft-glitter-68939130`, branch: `production`, function slug: `tipapi`.

API URL: https://br-cool-sky-b55267cq-tipapi.compute.c-7.us-east-2.aws.neon.tech/

The API keeps NestJS, Prisma, JWT guards and existing business services. Neon Functions runs the packaged API on Node.js 24; the Next.js frontend needs its own host.

## Environment

Keep secrets in the ignored `.env` file:

- `DATABASE_URL`: Neon pooled URL for application queries.
- `DATABASE_URL_UNPOOLED`: direct URL for Prisma migrations.
- `REDIS_URL`: cloud Redis TLS URL (`rediss://...`). A local Redis URL cannot work on Neon.
- `JWT_SECRET` and optionally `JWT_REFRESH_SECRET`: existing JWT signing secrets.
- `ORIGIN_SECRET`: random secret shared only with the Next.js server.
- `SMTP_USER` and `SMTP_PASS`: Gmail address and app password, required in production. `SMTP_HOST` defaults to `smtp.gmail.com`, `SMTP_PORT` to `587` (STARTTLS), and `SMTP_FROM` to `SMTP_USER`. Delivery has an eight-second deadline and is never retried automatically.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: uploads.

`neon env pull --service postgres` updates database URLs. Never commit `.env`, `.env.*` backups, `.neon` or `.neon-build`.

## Commands

```powershell
npm run db:deploy
npm run deploy:neon
```

For a database with existing data, verify migrations on a temporary child branch before applying them to production. `db:deploy` applies versioned migrations; it does not copy accounts or other data from a local database.

`build:neon` generates Prisma for the local platform and Linux ARM64/OpenSSL 3, compiles NestJS with decorator metadata, and bundles the compiled JavaScript into `.neon-build`. Prisma, bcrypt and Swagger static assets remain separate files. This keeps the artifact within Neon's file-count limit. `neon deploy --env .env` uploads that prepared directory with runtime environment values. Do not deploy an old artifact after changing source; use `deploy:neon`.

## Frontend connection

Get the invocation URL with `neon functions get tipapi`. Set these **server-only** variables in the frontend environment:

```dotenv
BACKEND_API_URL=https://<function-host>
BACKEND_ORIGIN_SECRET=<same value as backend ORIGIN_SECRET>
```

The Next.js server includes `X-Secret` on API calls, including refresh-token requests. Existing user bearer tokens still enforce role and record access. The public university directory also loads through Server Actions, so the origin secret never reaches the browser.

The Function rejects requests missing this origin secret before starting NestJS. An ordinary browser request to the Function URL returning 401 is expected. To verify deployment, request `/health` with `X-Secret` from a trusted server; both PostgreSQL and Redis must report `up`. Verify `/auth/me` returns 401 without a user bearer token, and then test login/OTP using a registered account.

The production database was initialized from migrations, without importing local accounts. Register/verify the intended account before granting the first administrator role through an authorized administration process.
