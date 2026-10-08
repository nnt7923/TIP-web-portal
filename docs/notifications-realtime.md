# Notification WebSocket contract and operations

## Contract

- `POST /notifications/socket-ticket`: existing Bearer JWT authentication; returns `{ ticket, expiresAt }`. Disabled realtime returns 503 with `REALTIME_DISABLED`.
- Connect to `wss://<backend>/notifications/ws` with an exact allowed browser Origin. Within five seconds send `{"type":"authenticate","ticket":"..."}`. Do not put credentials in the URL.
- Server acknowledges with `{"type":"notifications.ready"}`. Reload REST state on every acknowledgement.
- Invalidation: `{"type":"notifications.changed","eventId":"uuid","reason":"created|read|read-all","emittedAt":"ISO timestamp"}`. It contains no notification content, account IDs, recipient list or authorization grant.
- Clients cannot subscribe to account IDs or publish events. All other client frames close the connection. Frame limit: 1 KiB; compression disabled.
- Close 4401: obtain a new ticket through the existing refresh flow; stop if the authenticated REST request is rejected. Close 1013: temporary outage, retry with exponential backoff and jitter. Vercel duration/deployment closure also reconnects.

Tickets contain 256 bits of randomness, are stored under a SHA-256 hash in Redis, expire within 60 seconds/access-token expiry and are atomically consumed with GETDEL. Session, revocation, active account/profile/organization and token expiry checks are shared with REST JWT validation. Validation runs at authentication, before delivery and every 30 seconds. Ticket issuance is limited to 30/account/minute and handshakes to 120/IP/minute. Only Vercel's overwritten forwarding header is trusted on Vercel; other hosts use the socket peer.

## Transactions and delivery

All notification-producing business transactions must use `NotificationEventsService.transaction(work, options)`. It preserves Prisma transaction options and publishes only after successful commit. `createManyAndReturn(...skipDuplicates)` collects only recipients of rows actually inserted. Rollbacks, duplicate insert attempts and no-op reads do not publish. The four REST endpoints remain unchanged.

Redis Pub/Sub is best-effort invalidation, not a durable queue. A process dying after database commit or a failed publish can lose the signal, but never the Notification row. The client reloads authoritative REST data after reconnect, visibility changes and every 120 seconds while connected; disconnected polling is 30 seconds. No counters are incremented locally. Pub/Sub outages close sockets so fallback begins. Logs intentionally omit tokens, tickets and notification content.

## Environment

Backend:

```dotenv
NOTIFICATIONS_REALTIME_ENABLED=true
NOTIFICATIONS_REALTIME_NAMESPACE=production
NOTIFICATIONS_ALLOWED_ORIGINS=https://tip-web-portal.vercel.app,https://tip-web-portal-fe.vercel.app
# Keep empty in existing production; use a distinct prefix in isolated tests.
REDIS_KEY_PREFIX=
```

Frontend (server-only variables):

```dotenv
NOTIFICATIONS_REALTIME_ENABLED=true
NOTIFICATIONS_WEBSOCKET_URL=wss://tip-web-portal-api.vercel.app/notifications/ws
```

Preview must use a separate database branch, auth secrets, `REDIS_KEY_PREFIX` and realtime namespace. The existing Redis provider is shared with logical key/channel isolation. Do not use a production session in preview. Protected Vercel previews use a server-only `BACKEND_PROTECTION_BYPASS`; browser automation installs Vercel's bypass cookie. Do not disable deployment protection. Keep production and preview allowed Origins separate.

Both Vercel projects require Fluid Compute. Backend uses Node 22, frontend Node 24. The backend Vercel project has `resourceConfig.functionDefaultTimeout=300` (project setting; the zero-config Nest adapter does not accept a `src/main.ts` functions pattern). Connections still expire and are not guaranteed to reconnect to the same instance. See [Vercel WebSockets](https://vercel.com/docs/functions/websockets) and [duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).

## Reproducible checks

Backend clean checkout: `npm ci`, `npm run db:generate`, `npm run build`, `npm run lint:check`, `npm test -- --runInBand`. Do not run the auto-fixing `lint` script as a release check.

Real integration tests load only ignored `.env.realtime-test.local`, never the application's `.env`. Create an isolated schema-only Neon branch with the current schema and a unique Redis prefix, then set direct `DATABASE_URL`/`DATABASE_URL_UNPOOLED`, `REDIS_URL`, `REDIS_KEY_PREFIX`, `JWT_SECRET`, `ORIGIN_SECRET`, `NODE_ENV=test`, realtime flag/namespace and local allowed Origin. Deliberately update the endpoint/prefix allowlists in both integration scripts when rotating the branch. The October 7 branch expires October 10; these guards must not be relaxed to accept production. Run `npm run test:notifications`, then `npm run test:realtime` sequentially: concurrent SERIALIZABLE fixtures on one database may legitimately conflict. Fixtures clean up only IDs created by that run.

Frontend clean checkout: `npm ci`, `npx playwright install chromium`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:browser` under Node 24. Browser tests launch the production build against their own fake backend and never use production accounts. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an installed Chromium.

`test/realtime.preview.cjs` is opt-in: it requires ignored `.env.preview-tools.local` (`BE_BYPASS`, `FE_BYPASS`) and JSON `.env.preview-fixtures.local` containing isolated `admin`/`person` usernames, password, universityId and majorId. The admin must be an active school administrator; the person an active verified personal account. URLs are allowlisted preview aliases in the script. It submits/rejects synthetic enrollment requests, checks real WebSocket frames, measures 20 healthy samples, separately records timeout/reconnect recovery and captures desktop/mobile screenshots. Set `VERIFY_FUNCTION_LIFETIME=true` to additionally wait for actual Vercel duration closure and verify delivery on the replacement socket. Never point it to production. Results go to ignored `tmp/`.

## Release and rollback

1. Validate the current schema with read-only `prisma migrate status` using the direct connection. Apply missing reviewed migrations first; this release has no new migration.
2. Complete isolated integration, browser and preview checks. Commit only reviewed code, contracts, documentation, lockfiles and regression tests.
3. Deploy backend, verify health/auth rejection/upgrade, then deploy frontend. Existing polling clients remain compatible.
4. Observe at least 30 minutes: API 5xx, `redis_connection_unavailable`, `notification_publish_failed`, `notification_subscription_unavailable`, socket authentication and `notification_signal_delivered.delayMs`. The latter measures server signal latency, not end-to-end UI latency; use preview browser measurements for that.
5. For a critical access/data/business regression, disable realtime on both projects and redeploy/roll back the affected application. Frontend flag false restores 30-second polling. Environment edits require a new deployment; an already loaded tab keeps its current flag until reload, but closed/rejected sockets still use fallback. Keep notification history and schema.

Known limits: no durable delivery acknowledgements, no arbitrary replay cursor and no guarantee of the two-second target while reconnecting, offline or backgrounded. These cases converge via authorized REST reads. More clients increase recurring session-validation queries; monitor query latency and Redis connections before raising per-instance limits.
