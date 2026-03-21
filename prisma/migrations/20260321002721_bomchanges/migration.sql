-- AlterTable: Add totalCost column
ALTER TABLE "bom_item" ADD COLUMN "totalCost" DOUBLE PRECISION;

-- Backfill: set totalCost = costPerItem * quantity for existing rows that don't have totalCost
UPDATE "bom_item" SET "totalCost" = "costPerItem" * "quantity" WHERE "totalCost" IS NULL;

-- Make totalCost required now that all rows have a value
ALTER TABLE "bom_item" ALTER COLUMN "totalCost" SET NOT NULL;

-- Make costPerItem optional (kept but no longer used)
ALTER TABLE "bom_item" ALTER COLUMN "costPerItem" DROP NOT NULL;

-- Make quantity optional
ALTER TABLE "bom_item" ALTER COLUMN "quantity" DROP NOT NULL;
