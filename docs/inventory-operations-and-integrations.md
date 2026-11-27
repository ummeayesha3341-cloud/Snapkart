# Inventory operations and integration roadmap

## Current workflow

SnapKart keeps one stock balance per product. Admins can inspect each product's movement history, make a reasoned manual adjustment, save an inbound delivery as a draft, and confirm the quantities received. Confirming a draft is one-time and transactional: stock increases, a receipt-linked inventory movement is written, and the staff member and timestamp are recorded together. Checkout sales, returns put back into stock, opening quantities, and manual corrections also write movements.

The movement history is the audit record; `Product.stock` remains the current balance used by the cart and checkout. Receipt drafts do not alter sellable stock. New opening quantities, sales, returns, receipts, and manual corrections are logged. Legacy stock changes before this rollout may not have complete movement history, especially sales; use a physical count before treating old event history as a full ledger. This implementation does not connect to a supplier system, POS, ERP, scanner, or a second store.

## POS/ERP synchronization, when scheduled

Before connecting an external system, choose a single stock authority per store and define which system owns product IDs, barcode changes, prices, purchase orders, sales, and returns. Add a provider adapter behind a stable internal interface rather than coupling vendor fields to checkout. Use external item references, idempotent event keys, a durable outbox/inbox, retry and dead-letter handling, reconciliation reports, and observable sync lag. An inbound event must never apply twice; an outbound correction must preserve the movement audit and identify its source.

Pilot in read-only or shadow mode first: import and compare balances without changing customer-facing stock. Then enable a narrow category or event type, reconcile counts with staff, and document rollback and conflict ownership before expanding.

## Multiple store locations, when scheduled

The present `Product.stock` field is global. A multi-store rollout needs a `Store` entity and a per-store inventory balance/ledger, with store-scoped receiving, adjustments, sales allocation, staff permissions, and admin views. Migrate existing stock as an opening movement for one explicitly selected store, then update cart availability and checkout to select that store before enabling more locations. Do not infer a location from an external event or silently treat a global balance as a per-store balance.

## Rollout checkpoints

1. Use stock receiving and history at one pilot location; reconcile a physical count against the logged balance.
2. Agree on the system of record and stable external product/store identifiers with the POS/ERP owner.
3. Build and monitor idempotent sync in shadow mode; compare imported events and balances.
4. Design and migrate per-store inventory before activating additional locations.
