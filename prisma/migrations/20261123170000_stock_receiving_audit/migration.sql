CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_BALANCE', 'MANUAL_ADJUSTMENT', 'SALE', 'RETURN', 'RECEIPT');
CREATE TYPE "StockReceiptStatus" AS ENUM ('DRAFT', 'RECEIVED');

ALTER TABLE "InventoryAdjustment"
  ALTER COLUMN "adminUserId" DROP NOT NULL,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "stockReceiptId" TEXT,
  ADD COLUMN "movementType" "InventoryMovementType" NOT NULL DEFAULT 'MANUAL_ADJUSTMENT',
  ADD COLUMN "sourceSystem" TEXT,
  ADD COLUMN "externalReference" TEXT;

CREATE TABLE "StockReceipt" (
  "id" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "deliveryReference" TEXT,
  "notes" TEXT,
  "status" "StockReceiptStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByAdminId" TEXT NOT NULL,
  "receivedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3),
  CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockReceiptItem" (
  "id" TEXT NOT NULL,
  "stockReceiptId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCostMinor" INTEGER,
  CONSTRAINT "StockReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryAdjustment_orderId_idx" ON "InventoryAdjustment"("orderId");
CREATE INDEX "InventoryAdjustment_stockReceiptId_idx" ON "InventoryAdjustment"("stockReceiptId");
CREATE UNIQUE INDEX "InventoryAdjustment_sourceSystem_externalReference_key" ON "InventoryAdjustment"("sourceSystem", "externalReference");
CREATE INDEX "StockReceipt_status_createdAt_idx" ON "StockReceipt"("status", "createdAt");
CREATE INDEX "StockReceipt_deliveryReference_idx" ON "StockReceipt"("deliveryReference");
CREATE UNIQUE INDEX "StockReceiptItem_stockReceiptId_productId_key" ON "StockReceiptItem"("stockReceiptId", "productId");
CREATE INDEX "StockReceiptItem_productId_idx" ON "StockReceiptItem"("productId");

ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_receivedByAdminId_fkey" FOREIGN KEY ("receivedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
