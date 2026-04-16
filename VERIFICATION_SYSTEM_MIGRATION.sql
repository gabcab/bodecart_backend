-- Migration: Add Delivery Person Documents and Update Relations
-- Run this SQL script manually in your PostgreSQL database

-- Create DeliveryDocumentType enum
CREATE TYPE "DeliveryDocumentType" AS ENUM (
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
  'BACKGROUND_CHECK',
  'PROFILE_PHOTO',
  'VEHICLE_PHOTO',
  'VEHICLE_PLATE_PHOTO'
);

-- Create delivery_person_documents table
CREATE TABLE "delivery_person_documents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deliveryPersonId" TEXT NOT NULL,
  "type" "DeliveryDocumentType" NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3),
  "reviewed_by_id" TEXT,
  "rejectionReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "delivery_person_documents_deliveryPersonId_fkey"
    FOREIGN KEY ("deliveryPersonId") REFERENCES "delivery_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "delivery_person_documents_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for delivery_person_documents
CREATE INDEX "delivery_person_documents_deliveryPersonId_idx" ON "delivery_person_documents"("deliveryPersonId");
CREATE INDEX "delivery_person_documents_type_idx" ON "delivery_person_documents"("type");
CREATE INDEX "delivery_person_documents_status_idx" ON "delivery_person_documents"("status");
CREATE INDEX "delivery_person_documents_reviewed_by_id_idx" ON "delivery_person_documents"("reviewed_by_id");

-- Optional: Add default UUIDs (if you're using a function for UUID generation)
-- If you're using gen_random_uuid(), make sure the extension is enabled:
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Note: The relation name changes in the schema need the existing bodega_documents table
-- to update its foreign key constraint name. This is already handled by Prisma if you use
-- migrate dev, but if running manually, verify the constraint name matches.

-- You may need to drop and recreate the constraint on bodega_documents if needed:
-- ALTER TABLE "bodega_documents" DROP CONSTRAINT "bodega_documents_reviewedById_fkey";
-- ALTER TABLE "bodega_documents" ADD CONSTRAINT "bodega_documents_reviewed_by_id_fkey"
--   FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
