-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "requires_address" BOOLEAN NOT NULL DEFAULT false;
