-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'IN_PROGRESS', 'READY', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('CHECKED_OUT', 'RETURNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_IMPORT';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ORDER_STATUS_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_RENTAL_RETURN';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_LOCK';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_SETTINGS_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ITEM_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ITEM_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ITEM_DELETE';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "stock" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "maxPerTeam" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "placedById" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "floor" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_rental" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "rentedById" TEXT NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'CHECKED_OUT',
    "floor" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "inventory_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_name_key" ON "team"("name");

-- CreateIndex
CREATE INDEX "order_teamId_idx" ON "order"("teamId");

-- CreateIndex
CREATE INDEX "order_placedById_idx" ON "order"("placedById");

-- CreateIndex
CREATE INDEX "order_item_orderId_idx" ON "order_item"("orderId");

-- CreateIndex
CREATE INDEX "order_item_itemId_idx" ON "order_item"("itemId");

-- CreateIndex
CREATE INDEX "tool_rental_toolId_idx" ON "tool_rental"("toolId");

-- CreateIndex
CREATE INDEX "tool_rental_teamId_idx" ON "tool_rental"("teamId");

-- CreateIndex
CREATE INDEX "tool_rental_rentedById_idx" ON "tool_rental"("rentedById");

-- CreateIndex
CREATE INDEX "user_teamId_idx" ON "user"("teamId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_rental" ADD CONSTRAINT "tool_rental_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_rental" ADD CONSTRAINT "tool_rental_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_rental" ADD CONSTRAINT "tool_rental_rentedById_fkey" FOREIGN KEY ("rentedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
