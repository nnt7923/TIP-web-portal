# Upload contracts and verification

## CVs

- `POST /students`, `PATCH /students/:id`, `PATCH /students/me` accept the optional multipart field `cv`: PDF, Word 97–2003 DOC or DOCX, at most 4,194,304 bytes. Existing JSON and `cvUrl` requests still work. A file takes precedence over `cvUrl`.
- Extensions are case insensitive. Browser MIME is not authoritative. PDF retains header-based recognition; this is not a full PDF integrity scan. DOC is inspected as CFB/Word with an isolated parser (2 second CPU deadline, 64 MiB worker heap). DOCX is inspected as an OOXML ZIP (2,048 entries, 32 MiB declared expanded total, 8 MiB per required XML part); DTD/entity declarations, encrypted Word and detected macros are rejected. This is format validation, not antivirus scanning.
- New raw assets use UUID public IDs including the validated extension, with overwrite disabled. Existing URLs/public IDs are preserved until an explicit replacement/removal. No migration or backfill is needed.
- PDF recognition permits ASCII whitespace (tab, line feed, form feed, carriage return, space) before the signature, provided the complete version header is in the first 1,024 bytes. Arbitrary prefixes and high-bit byte lookalikes remain rejected. Validation preserves the submitted bytes; it does not rewrite PDF object offsets.

## Logos and failure behavior

- Company and university POST/PATCH endpoints accept the optional multipart field `logo`: JPG/PNG/WebP, at most 4 MiB. Existing System Admin authorization and JSON requests are preserved. Admin UI continues to use URL inputs.
- File replacement, clearing and record deletion compare the observed URL/public ID atomically. A conflict returns `409` and cleans only the losing request's new file. Old files are deleted only after database success. Cleanup failures are logged without failing a committed operation.
- Cloudinary SDK idle timeout and total upload deadline are 30 seconds. Provider errors return sanitized `502`; upload timeouts return `504`. A late successful callback after failure triggers best-effort cleanup. A process termination can still prevent cleanup; no distributed transaction with Cloudinary is claimed.
- Upload failure logs include the failure stage, numeric provider HTTP status (when available), and an allowlisted error kind. Provider messages, stack traces, credentials and file contents are omitted. For example, `stage=provider, status=403` confirms a provider denial; `stage=setup, status=unknown` identifies a local SDK setup failure.
- Frontend Server Actions wait up to 45 seconds. An uncertain response triggers an authenticated profile reload before another save. Read failure leaves a reload button and the selected file intact; there is no automatic mutation retry. Tokens remain in HttpOnly cookies.

## Local regression checks

Use Node 22 for backend and Node 24 for frontend.

Backend: `npm test -- --runInBand`, `npm run lint:check`, `npx tsc --noEmit`, `npm run build`. Jest's VM module flag in `npm test` allows Nest's image validator to load its ESM detector without replacing content validation with MIME-only checks.

Frontend: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, then `npm run test:uploads:browser`. The browser harness starts a local mock API and production Next server, closes both afterward and writes no screenshots or temporary credential files. It covers selection/save/removal, errors and reconciliation, expired-session rejection, desktop and mobile. It does not validate Cloudinary availability.

Fixtures in `src/common/fixtures` are synthetic test documents; upstream Word files retain their Apache license and source attribution. Database/Cloudinary calls in unit and HTTP regression tests are mocked; these checks must never be presented as a real provider or PostgreSQL integration pass.

## Required before release

On an isolated database and Cloudinary test environment, authenticate a test student/admin, upload the three fixture formats through the actual API, download each returned URL and compare its bytes with the original. Repeat replacement, clearing, concurrent replacement and company/university logo uploads; verify referenced assets survive and discarded uploads are deleted. Confirm the Cloudinary environment allows PDF/raw delivery. Do not use production credentials/data or backfill existing assets. These external integration checks have not been run as part of the local implementation.

## Deployment verification, 2026-10-08

The Vercel candidates built successfully with Node 22 (API) and Node 24 (frontend). Live checks used synthetic accounts in an existing schema-only Neon test branch; no production database fixtures were created. Deployed API checks passed for false/mismatched formats, a truncated DOCX, empty files, the size limit, missing authentication and cross-school access. Deployed frontend checks on desktop and mobile confirmed that an upload failure preserves the selected DOC/DOCX and the previously stored CV, without reporting success. Test accounts, organizations and Redis sessions were removed afterward.

**Release blocked:** a signed upload with the local Cloudinary configuration returned HTTP 403, `Request forbidden due to missing permissions (actions=["create"])`. A candidate inheriting Vercel production Cloudinary settings also returned the sanitized upload error (HTTP 502). Successful provider upload/download and replacement/cleanup checks therefore remain unverified. Check the Cloudinary application's create/delete permissions and Vercel credentials, then redeploy and rerun those checks before promoting. The primary production domains stayed on their previous deployments. Vercel assigned its secondary project alias despite `--skip-domain`; that alias was restored to the original production deployment, and all three test deployments were removed.
