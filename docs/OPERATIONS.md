# Operations readiness

This checklist is a starting point for a controlled pilot. SnapKart's seeded catalog uses synthetic barcodes and mock payment processing; it is not ready for real-store checkout until product data, payment processing, support, and the controls below are reviewed for the store and its jurisdiction.

## API and browser checks

- `npm run test:api` runs API validation, auth-boundary, CORS, and metrics checks through Fastify injection. It does not write to Neon.
- `npm run test:e2e` runs browser journeys against mocked Supabase and API responses. It does not create production orders.
- `npm run test:integration` calls the configured deployed catalog API and is read-only.
- `npm run test:e2e:live` uses real credentials and can create a cash order and reduce stock on the configured database. Run only against a dedicated test branch and test user.

## Load checks

Start with a local or dedicated staging instance. `npm run test:load` checks only `GET /health` and `GET /products?limit=20`, with three workers for ten seconds by default. Tune using `LOAD_TEST_SECONDS`, `LOAD_TEST_CONCURRENCY` (capped at 20), and `LOAD_TEST_MAX_P95_MS` (default 1000). The script refuses non-local hosts unless `LOAD_TEST_ALLOW_REMOTE=true`; use that opt-in only for a system you own, with an agreed test window and a concurrency appropriate to its capacity. It fails on HTTP/network errors or when p95 exceeds the threshold. This small check is a smoke load, not a capacity certification; increase gradually and watch database/hosting limits.

## Errors and latency monitoring

Set a long random `METRICS_TOKEN` in the API host's secret manager. The API exposes Prometheus text metrics at `/metrics` only when the request has `Authorization: Bearer <token>`; without a configured token or with a wrong token, it returns 404. Scrape over a private network or TLS and keep the bearer value in the collector's secret store (for Prometheus, use `authorization.credentials_file`). Metrics use Fastify route templates rather than raw URLs to avoid recording identifiers as labels. They include request counts by method/route/status, 5xx counts, and latency histogram buckets. Keep an eye on 5xx rate and p95/p99 latency alongside hosting CPU/memory, database connections, query latency, and provider health. Fastify logs warnings for 5xx and requests taking at least one second; the logger redacts authorization and cookie headers. Configure the hosting provider's log retention and alert delivery before a pilot; this repository does not provision a hosted Prometheus or alerting service.

Example starting alerts: API 5xx rate above 2% for 5 minutes, p95 above 1 second for 10 minutes, or health check failures for 2 minutes. Tune these after collecting staging baselines and the store's service objectives.

## Backup policy to agree before store use

Proposed pilot objectives (confirm with the store owner): **RPO 15 minutes** for database changes and **RTO 4 hours** for restoring customer checkout. These are targets, not guarantees; validate them with drills and the selected Neon plan/settings.

1. Enable and verify Neon point-in-time history retention appropriate to the RPO. Check current plan limits and branch settings in Neon; do not assume an unverified retention period.
2. Keep an independent encrypted logical backup outside the Neon project/account. At minimum, schedule daily `pg_dump` in custom format, retain 30 daily and 12 monthly copies, and alert on any failed or missing backup. Store encryption keys separately and restrict restore credentials.
3. Before schema migrations or risky inventory imports, take/verify an extra backup or Neon snapshot where available. Snapshots and PITR availability/retention depend on current Neon features and plan.
4. Run a restore drill at least quarterly into a separate Neon branch/database. Verify migrations, user/order/item/payment/inventory consistency, counts and representative records; record achieved RPO/RTO and fix gaps.
5. Restrict production write access, use reviewed migrations, and keep the previous release/configuration available for rollback. Do not store secrets or raw customer payment credentials in backups or logs.

## Recovery runbook

1. Declare the incident, stop risky writes/deployments, and preserve logs and the original database branch. Never overwrite the only recoverable copy.
2. For accidental recent writes, use Neon PITR to create a recovery branch at a time before the incident. For broader corruption/outage, restore the independent encrypted dump into a new isolated database/branch. Follow current Neon console guidance and confirm the chosen branch/time before acting.
3. Point a staging API at the restored branch using a restricted secret, apply only reviewed schema migrations if necessary, and verify health, auth mapping, catalog, recent orders, payment states, inventory movements, and referential integrity.
4. Reconcile transactions written after the recovery point using provider/order records before reopening checkout. Never replay checkout blindly; its idempotency keys and payment reconciliation must be considered.
5. Have the operator approve cutover: update the production database secret/connection target, restart the API, check `/health`, watch error/latency metrics, and perform read-only smoke checks. Keep the original branch and incident backup until recovery is confirmed and retention permits cleanup.
6. Record the incident timeline, data loss window, restore duration, reconciliation, and follow-up actions; update the runbook from the drill.

Neon's published guidance describes PITR as restoring to a point in branch history, and snapshots as restoring to a new branch. Review the current instructions and retention behavior before an incident: [Neon point-in-time restore](https://neon.com/blog/announcing-point-in-time-restore) and [Neon snapshots](https://neon.com/blog/announcing-neon-snapshots-a-smoother-path-to-recovery).

## Sales, demand, returns, and account security

### Sales trends

Admin **Sales & demand** reports paid orders by UTC day, week, or month for a selected range up to 366 days. It groups each currency separately, subtracts completed refunds from net sales, and shows mock UPI/card activity in a separate simulated field. Current reports have no tax or discount model and are not accounting statements; reconcile them with payment provider and cash records. Extend to store/location comparison only after location scope and reporting timezone are defined.

### Product demand

Demand reporting records successful barcode lookups, cart additions/removals, purchases, returns, and attempted purchases while stock is zero/insufficient. Events do not include customer IDs. The report shows current stock beside those signals; it does not reconstruct historical stockout duration. Agree an event retention period and privacy notice before collecting pilot traffic, and protect/monitor storage growth.

### Refund and return workflow

Current initial policy: customers may request an unused-item return within **30 days** of purchase. The customer attests the items are unused; an administrator reviews each request and records a disposition (restock, quarantine, or discard). Requests are item-quantity scoped and audited. Mock online payment refunds are explicitly marked simulated and move no money. Cash refunds require an operator to confirm the physical payout. Online refunds for any real gateway are rejected until an idempotent, verified provider refund integration and reconciliation workflow are added. Before store use, confirm exceptions, proof/evidence requirements, local consumer rules, and whether the return window includes the purchase date.

### Account recovery and MFA

Supabase email password recovery is available through the sign-in flow and returns a generic response to avoid confirming whether an account exists. Admin accounts must enroll and verify a TOTP authenticator before admin APIs permit inventory, order, analytics, or refund access. Supabase MFA must be enabled/configured in the project. Encourage admins to enroll a second device as backup. Supabase MFA recovery codes are not used here; if an admin loses every factor, an authorized operator must verify identity out-of-band and reset the factor in Supabase, record the action, and require re-enrollment. Never bypass the backend AAL2 check or store passwords/recovery secrets in SnapKart tables.

For expansion, add explicit tests for mixed currencies, timezone boundaries, partial returns, duplicate/concurrent return submissions, refund reconciliation, MFA enrollment and challenge, lost-factor support, and role changes.
