# SnapKart API

SnapKart is a barcode-to-cart self-checkout project. Its goal is to reduce customer waiting time, improve transaction convenience, and reduce reliance on conventional cashier-operated billing counters. This repository contains the backend API; the frontend is developed separately.

## Start locally

1. Install Node.js 22+ and Docker.
2. Copy `.env.example` to `.env`; replace `JWT_SECRET` with a random secret of at least 32 characters.
3. Run `docker compose up -d` to start PostgreSQL.
4. Run `npm install`, then `npm run db:generate` and `npm run db:migrate`.
5. Run `npm run db:seed` to load the 99 mock catalog products, then `npm run dev`. Health check: `GET http://localhost:3000/health`.

Money uses integer minor units (`priceMinor`: paise for INR). `prisma/mock-products.json` is development-only sample data derived from the supplied workbook. Since the workbook does not state a currency, its prices are treated as INR for this mock import; change that assumption if its creator intended another currency. It includes synthetic scan identifiers (`SNAPMOCK0001`, etc.) because the workbook's UPC values aren't reliable enough to represent real retail barcodes. Make QR labels containing these identifiers to exercise the scan-to-lookup flow, or pass them directly to `GET /products/barcode/:barcode`. The seed command is safe to re-run for those mock identifiers, but it overwrites their current seeded fields. Do not use this catalog or its generated identifiers for real retail checkout.

The local payment adapter returns a simulated success and must be replaced before handling real payments. Never accept card details in this API; use a PCI-compliant provider's hosted/tokenized flow and verify signed webhooks. Admin users should be provisioned out-of-band by an operator; public registration always creates a customer.

## API overview

All request and response bodies are JSON. Protected routes require `Authorization: Bearer <token>`. Cart mutations and checkout require an authenticated customer. Admin routes require a database user with role `ADMIN`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Catalog / barcode lookup | `GET /products?q=&page=&limit=`, `GET /products/barcode/:barcode` |
| Cart | `GET /cart`, `POST /cart/items` (`barcode`, `quantity`), `PATCH /cart/items/:id` (`quantity`), `DELETE /cart/items/:id` |
| Checkout / history | `POST /checkout` (requires `Idempotency-Key`), `GET /orders`, `GET /orders/:id` |
| Admin | `GET /admin/summary`, `GET /admin/inventory`, `POST /admin/products`, `PATCH /admin/products/:id`, `POST /admin/products/:id/inventory-adjustments`, `GET /admin/orders` |

Checkout revalidates inventory and snapshots product names/prices into order lines in a serializable database transaction. Orders are scoped to their customer on customer routes. Inventory corrections record the admin, delta, resulting quantity, reason, and timestamp. Payment reconciliation/webhooks, tax, discounts, store/location scoping, and shipment/fulfilment are follow-on integrations.

There is no web client in this repository yet, so the admin interface is represented by protected admin APIs for a future dashboard to consume. Promote the first operator to `ADMIN` through a controlled database operation before using those routes; the public registration endpoint cannot assign roles.
