# SnapKart API

SnapKart is a barcode-to-cart self-checkout project. Its goal is to reduce customer waiting time, improve transaction convenience, and reduce reliance on conventional cashier-operated billing counters. This repository contains the backend API; the frontend is developed separately.

## Start locally

1. Install Node.js 22+ and Docker.
2. Copy `.env.example` to `.env`; fill in the Supabase project URL and publishable key.
3. Run `docker compose up -d` to start PostgreSQL.
4. Run `npm install`, then `npm run db:generate` and `npm run db:migrate`.
5. Run `npm run db:seed` to load the 99 mock catalog products, then `npm run dev`. Health check: `GET http://localhost:3000/health`.

## Start the frontend

In a second PowerShell window, run `Set-Location .\frontend`, `npm install`, then `npm run dev`. Open `http://localhost:5173`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local` to the same Supabase project. The frontend calls the API at `http://localhost:3000` by default; set `VITE_API_BASE_URL` there if the API uses a different address.

## Authentication setup

Supabase Auth handles sign-up, sign-in, and sessions. The Fastify API verifies Supabase access tokens and maps each confirmed Supabase identity to the SnapKart `User` row in Neon; catalog, carts, orders, and admin roles stay in Neon. Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the backend (including Render), and the `VITE_` versions in the frontend environment. The publishable key is intended for browser use; never put a Supabase secret/service-role key in the frontend.

Apply the additive Neon schema migration before deploying the backend: run `npm run db:generate` and `npm run db:deploy`. Existing user rows and roles are retained and linked by email after Supabase confirms ownership of that email. Old password hashes cannot be transferred to Supabase Auth, so existing users must create/reset their Supabase password with the same email to link their SnapKart history. Newly created users need a verified email before API access. Configure Supabase Auth's Site URL and redirect allow list for `http://localhost:5173` and the deployed frontend URL.

Money uses integer minor units (`priceMinor`: paise for INR). `prisma/mock-products.json` is development-only sample data derived from the supplied workbook. Since the workbook does not state a currency, its prices are treated as INR for this mock import; change that assumption if its creator intended another currency. It includes synthetic scan identifiers (`SNAPMOCK0001`, etc.) because the workbook's UPC values aren't reliable enough to represent real retail barcodes. Make QR labels containing these identifiers to exercise the scan-to-lookup flow, or pass them directly to `GET /products/barcode/:barcode`. The seed command is safe to re-run for those mock identifiers, but it overwrites their current seeded fields. Do not use this catalog or its generated identifiers for real retail checkout.

Checkout supports cash at hand-off and a guarded mock UPI/card flow. Set `PAYMENT_PROVIDER=mock` on the backend to enable simulated online payments; these create clearly marked simulated payment records and do not transfer money or collect payment credentials. Simulated payments are excluded from admin revenue. Cash orders remain pending until an admin records the cash as received. For real UPI/card transactions, replace the mock adapter with a gateway-hosted checkout and verify signed payment callbacks before enabling live payments. Admin users should be provisioned out-of-band by an operator; public registration always creates a customer.

## API overview

All request and response bodies are JSON. Protected routes require `Authorization: Bearer <token>`. Cart mutations and checkout require an authenticated customer. Admin routes require a database user with role `ADMIN`.

| Area | Endpoints |
| --- | --- |
| Auth | Supabase Auth SDK sign-up/sign-in, `GET /auth/me` (Supabase bearer token) |
| Catalog / barcode lookup | `GET /products?q=&page=&limit=`, `GET /products/barcode/:barcode` |
| Cart | `GET /cart`, `POST /cart/items` (`barcode`, `quantity`), `PATCH /cart/items/:id` (`quantity`), `DELETE /cart/items/:id` |
| Checkout / history | `POST /checkout` (requires `Idempotency-Key`), `GET /orders`, `GET /orders/:id` |
| Admin | `GET /admin/summary`, `GET /admin/inventory`, `POST /admin/products`, `PATCH /admin/products/:id`, `POST /admin/products/:id/inventory-adjustments`, `GET /admin/orders` |

Checkout revalidates inventory and snapshots product names/prices into order lines in a serializable database transaction. Orders are scoped to their customer on customer routes. Inventory corrections record the admin, delta, resulting quantity, reason, and timestamp. Payment reconciliation/webhooks, tax, discounts, store/location scoping, and shipment/fulfilment are follow-on integrations.

The React frontend lives in `frontend/`. It includes customer shopping screens and an admin dashboard at `/admin`; the dashboard is linked from Profile for `ADMIN` accounts. Promote the first operator to `ADMIN` through a controlled database operation before using admin features; public registration cannot assign roles.
