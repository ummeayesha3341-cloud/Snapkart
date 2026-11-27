# SnapKart security audit

Audit date: 2026-11-27

## Repository changes

- `.env` and `frontend/.env.local` are ignored by Git. Secret values were not printed during this audit. The local API environment is development-only, with a localhost-only CORS origin. Stale, unused `JWT_SECRET` and `JWT_EXPIRES_IN` entries were removed; authentication is delegated to Supabase Auth.
- Production API startup now requires database and Supabase configuration, rejects placeholder Supabase settings, requires TLS on the PostgreSQL URL, rejects wildcard/non-origin CORS values, and requires HTTPS origins. CORS only permits the methods and headers used by this API.
- Fastify request bodies are capped at 256 KiB. Authorization, cookie, set-cookie, and API-key headers are redacted from logs. Production logging is fixed to `info`; the API returns generic unexpected errors and does not return stack traces.
- Helmet remains enabled. Global API rate limiting remains enabled, with tighter limits on barcode lookups, cart mutations, checkout, returns, public receipts, and gate actions.
- The Vite development server now binds to `127.0.0.1` and uses strict port selection. Do not expose the development server to the internet; deploy the built static frontend instead.
- Updated Prisma to the latest available 6.x line, overrode vulnerable Prisma configuration transitives to patched releases, updated Vite to 7.x and React Router to patched 7.x releases, and removed unused `@neon/env`.

## Access control and data handling reviewed

- Supabase validates bearer tokens server-side. Email verification is required before app user creation/linking. Admin routes check the database role and an `aal2` MFA claim on the verified token; staff gate routes require staff/admin role.
- Customer cart operations scope records to the signed-in customer. Orders and returns are queried using both the resource ID and authenticated user ID. Admin operations are separately protected.
- Request bodies and query parameters are parsed with Zod bounds/enums. Database access uses Prisma's parameterized query APIs; no raw SQL, `eval`, `new Function`, or `dangerouslySetInnerHTML` usages were found in the scanned application sources.
- The legacy `User.passwordHash` column is nullable and is not included in API response selections. Current sign-in uses Supabase Auth; the frontend Supabase publishable key is public by design and is not a server secret.

## Verification performed

- API TypeScript build: passed.
- Frontend production build: passed (Vite reports a large JavaScript chunk warning).
- Dependency installation/audit reported zero vulnerabilities after the updates. A subsequent standalone `npm audit` could not reach the npm advisory service because registry DNS was unavailable, so the live advisory database could not be rechecked in this run.
- Gitleaks scanned all Git history available in this local clone and found no findings. An additional token-pattern scan found only placeholder database URLs in `.env.example`; those are not credentials.
- Local `.env` database URLs are valid PostgreSQL URLs using TLS-required connections to Neon. Secret values and credentials were not output.

## Required actions outside this repository

1. In the hosting provider, ensure `NODE_ENV=production`, set `CORS_ORIGIN` to the exact HTTPS frontend origin(s), and add database/Supabase credentials through the provider's secret manager. Do not put database URLs, Supabase private/service-role keys, metrics tokens, or payment secrets in `VITE_*` variables.
2. Rotate any credential that has ever been pasted into chat, a screenshot, a public issue, a terminal transcript, or another exposed location. The local history scan cannot examine other clones, branches that were never fetched, hosting logs, or screenshots shared outside this repository.
3. Confirm the database provider restricts direct database access appropriately, application credentials have minimum required privileges, backups/PITR are enabled, and recovery has been tested. This code audit does not inspect provider dashboard policy or database grants.
4. Configure trusted client-IP rate limiting only if the production ingress is known to overwrite a trusted IP header. Set `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` only when the API is behind a trusted Cloudflare edge that replaces that header. The default deliberately does not trust caller-supplied forwarded-IP headers.
5. Configure static hosting to serve only the frontend build output and add host-level CSP/HSTS/security headers there. API Helmet headers do not configure the separate static frontend host.

This audit reduces identified risks; it is not a guarantee that the site cannot be compromised. Re-run dependency and secret scans in CI and after dependency changes.

