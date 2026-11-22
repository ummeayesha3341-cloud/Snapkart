CREATE TYPE "DemandEventType" AS ENUM ('SCAN', 'CART_ADD', 'CART_REMOVE', 'PURCHASE', 'RETURN', 'STOCKOUT_ATTEMPT');
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED');
CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCK', 'QUARANTINE', 'DISCARD');
CREATE TYPE "RefundStatus" AS ENUM ('NOT_STARTED', 'SIMULATED', 'CASH_PAID_OUT');
CREATE TYPE "ReturnAuditAction" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED');

CREATE TABLE "DemandEvent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "DemandEventType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemandEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "reviewerAdminId" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "unusedAttested" BOOLEAN NOT NULL DEFAULT false,
    "adminNote" TEXT,
    "disposition" "ReturnDisposition",
    "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "refundAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnItem" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnAuditEvent" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "ReturnAuditAction" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemandEvent_productId_type_createdAt_idx" ON "DemandEvent"("productId", "type", "createdAt");
CREATE INDEX "DemandEvent_createdAt_idx" ON "DemandEvent"("createdAt");
CREATE INDEX "ReturnRequest_customerUserId_createdAt_idx" ON "ReturnRequest"("customerUserId", "createdAt");
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");
CREATE UNIQUE INDEX "ReturnItem_returnRequestId_orderItemId_key" ON "ReturnItem"("returnRequestId", "orderItemId");
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");
CREATE INDEX "ReturnAuditEvent_returnRequestId_createdAt_idx" ON "ReturnAuditEvent"("returnRequestId", "createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "Payment_status_provider_idx" ON "Payment"("status", "provider");

ALTER TABLE "DemandEvent" ADD CONSTRAINT "DemandEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_reviewerAdminId_fkey" FOREIGN KEY ("reviewerAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnAuditEvent" ADD CONSTRAINT "ReturnAuditEvent_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnAuditEvent" ADD CONSTRAINT "ReturnAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
