-- CreateEnum
CREATE TYPE "ExceptionSource" AS ENUM ('MANUAL', 'HOLIDAY');

-- AlterTable
ALTER TABLE "exceptions" ADD COLUMN     "source" "ExceptionSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "extra_slots" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "service_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extra_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extra_slots_date_idx" ON "extra_slots"("date");

-- CreateIndex
CREATE INDEX "extra_slots_service_id_idx" ON "extra_slots"("service_id");

-- AddForeignKey
ALTER TABLE "extra_slots" ADD CONSTRAINT "extra_slots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
