-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "imported_bookings_count" INTEGER,
ADD COLUMN     "imported_last_booking_at" TIMESTAMPTZ;
