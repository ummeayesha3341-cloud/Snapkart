ALTER TABLE "Order" ADD COLUMN "receiptToken" TEXT;

CREATE UNIQUE INDEX "Order_receiptToken_key" ON "Order"("receiptToken");
