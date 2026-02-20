-- CreateTable
CREATE TABLE "temp_rsvp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "utmSource" TEXT,
    "referredBy" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "finishedAccount" BOOLEAN NOT NULL DEFAULT false,
    "syncedToAirtable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temp_rsvp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "temp_rsvp_email_key" ON "temp_rsvp"("email");

-- CreateIndex
CREATE INDEX "temp_rsvp_syncedToAirtable_idx" ON "temp_rsvp"("syncedToAirtable");
