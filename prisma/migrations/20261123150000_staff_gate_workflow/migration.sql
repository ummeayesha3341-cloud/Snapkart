ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';
CREATE TYPE "GateCheckOutcome" AS ENUM ('CLEARED', 'FLAGGED', 'DENIED', 'DUPLICATE');

CREATE TABLE "GateCheck" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "outcome" "GateCheckOutcome" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GateCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GateCheck_orderId_createdAt_idx" ON "GateCheck"("orderId", "createdAt");
CREATE INDEX "GateCheck_staffUserId_createdAt_idx" ON "GateCheck"("staffUserId", "createdAt");
CREATE UNIQUE INDEX "GateCheck_one_cleared_per_order_idx" ON "GateCheck"("orderId") WHERE "outcome" = 'CLEARED';

ALTER TABLE "GateCheck" ADD CONSTRAINT "GateCheck_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateCheck" ADD CONSTRAINT "GateCheck_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
