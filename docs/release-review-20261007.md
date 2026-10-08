# Release review — 2026-10-07

Scope: Notifications realtime, existing lazy-loaded frontend dialogs/dropdown and toast fixes. No Export or new business states. Both repositories reviewed across controllers/guards, organization scopes, DTOs, mutations/concurrency, uploads, secrets/logging, API contracts, paging and frontend session/error paths.

## Findings and disposition

| Severity | Evidence / reproduction | Resolution |
| --- | --- | --- |
| High, fixed | Publishing while a business transaction is open would let clients observe uncommitted state; a rollback must leave no signal. Concurrent duplicate inserts must not signal twice. | Shared transaction wrapper publishes only newly inserted recipients after commit. Real Postgres/Redis rollback, duplicate and concurrent tests. |
| High, fixed | A browser retaining old account state after shared cookies are replaced in another tab can show the previous account's notification data. | Login broadcasts session replacement; old tabs stop sockets/timers and discard cached notification data. Browser regression covers it. |
| High, fixed | Preview sharing production auth keys would mix sessions; prefixed Redis keys alone do not prefix keys assembled from Lua ARGV during logout-all. | Isolated preview database/secrets/key prefix/channel namespace. Logout-all prefixes the session-key argument as well. |
| High/moderate, fixed | Production dependency audit reported vulnerable transitive parsing/image dependencies in the existing lockfiles. | Compatible joi/proxy-addr and sharp/source-map-js updates; production-only npm audits now report zero vulnerabilities in both repos. |
| High, fixed October 8 | Re-running npm audit reported Next.js 16.3.6 security advisories, including GHSA-cjq9-62q9-8jv4. | Patch Next.js and matching ESLint config to 16.3.8; repeat unit/browser/lint/typecheck/build and production dependency audit. |
| Medium, fixed | Regression tests were broadly ignored by Git; a fresh checkout could not reproduce the existing checks. Browser harnesses depended on an ignored temporary Playwright install. | Track regression suites, add Playwright as a dev dependency and documented clean-checkout commands. |
| Medium, fixed | Backend preview Function duration was 60 seconds. A sustained browser test lost the socket at that boundary and recovered through REST/reconnect. | Explicit 300-second duration; retain retry and polling recovery, test actual lifetime closure separately from healthy latency. |
| Low, fixed | ioredis emitted unhandled connection error logs during preview idle/reconnect. | Redacted structured connection-unavailable warning; gateway subscription loss closes sockets. |

No additional confirmed production-blocking authorization or data-loss issue was found in the reviewed paths. This is a targeted code and regression review, not a claim that every possible path is defect-free.

## Review evidence

- JWT session validation reuses the existing active account/profile/organization policy. REST ownership queries return 404 for another account's notification; sockets derive recipients only from consumed server tickets.
- Application, enrollment, internship registration and placement writes retain their existing SERIALIZABLE/optimistic concurrency rules. Notification rows remain in the business transaction. Event recipients exclude actors and inactive/foreign-organization profiles.
- Public controller allowlist and guarded-route inventory were checked. Workspace deep links still resolve through scoped detail APIs; notification metadata cannot grant access or choose an external redirect.
- Upload size/type controls and explicit account selects were reviewed. Socket frames omit PII, JWTs and tickets; client cookies remain HttpOnly/Secure. No environment files or runtime artifacts belong in Git.
- Browser coverage includes notification filters/paging/read-all, unavailable detail targets, lazy chunk loading/failure, mobile overflow, toast behavior, reconnect/fallback, duplicate/burst invalidation, hidden tabs, session expiry and account replacement.
- Real integration coverage uses two Nest instances with isolated Postgres and logically isolated Redis; verifies single-use/expired/forged tickets, Origin, revocation, inactive account, cross-account isolation, commit/rollback, duplicates, read no-ops, missed/failed publication and subscriber loss.

## Non-blocking follow-up

- Full dependency audit still includes development-tool vulnerabilities (Jest/sprintf-js chain in backend; braces/micromatch/fast-glob in frontend lint tooling). They are absent from production dependency trees. Available automatic remedies require incompatible toolchain changes; track upstream compatible fixes instead of forced downgrades.
- Several existing administrative collection endpoints remain unpaginated. Add scoped paging with coordinated API contracts as data volume grows; do not silently change current response shapes in this release.
- Pub/Sub has no durable delivery queue. Lost signals are recovered by REST reconciliation; a durable outbox would be a separate reliability enhancement.
- Native sockets add periodic session checks and Redis subscriptions. Monitor connection count, database latency and hosting usage with real traffic; no load-capacity claim is made from the functional fixture tests.

## Release evidence

Local validation uses Node 22 for backend and Node 24 for frontend. Production database was checked read-only: all 23 migrations already applied. No migration/backfill needed. Preview uses a schema-only Neon branch expiring October 10 and synthetic accounts; no write test runs on production.

October 7 preview (60-second Function): 20 healthy samples, p95 1596 ms, max 1600 ms. One actual Function closure recovered through reconnect/reconciliation in 19832 ms including the business request. The two-second objective is measured only while connected; reconnection recovery is recorded separately.

October 8 local gates: 127 backend unit tests, 52 real-database notification assertions, 42 real Postgres/Redis realtime checks, 38 frontend unit tests and all four browser suites passed. Both builds, lint without fixes and frontend typecheck passed on Node 22/24. Production-only dependency audits: zero vulnerabilities. Desktop/mobile notification rendering and lazy loading were checked; initial homepage JavaScript measured 848960 bytes versus 982691 before lazy loading (uncompressed, fresh browser context).

October 8 final preview: backend `dpl_2uh4AXKvDVetYQoQDwk26P4RKZpG`, frontend `dpl_5SKxKaX5DD4horMKcX3oYb42DCVt`; 20 healthy samples, p95 **1693 ms**, maximum **1734 ms**. The 300-second Function closed the browser socket after approximately 316 seconds; the client reconnected and received a subsequent business event successfully. No browser exceptions or mobile overflow. Cookies were HttpOnly/Secure. The full preview harness passed.

Production observation results will be recorded after the 30-minute release observation completes.
