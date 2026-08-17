-- Un créneau ponctuel porte désormais une ou plusieurs prestations (relation
-- many-to-many) au lieu d'une seule. La table de liaison est créée et remplie
-- depuis extra_slots.service_id AVANT que la colonne ne soit supprimée, pour ne
-- perdre aucun créneau déjà enregistré.

-- CreateTable
CREATE TABLE "_ExtraSlotServices" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ExtraSlotServices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ExtraSlotServices_B_index" ON "_ExtraSlotServices"("B");

-- AddForeignKey
ALTER TABLE "_ExtraSlotServices" ADD CONSTRAINT "_ExtraSlotServices_A_fkey" FOREIGN KEY ("A") REFERENCES "extra_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExtraSlotServices" ADD CONSTRAINT "_ExtraSlotServices_B_fkey" FOREIGN KEY ("B") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration des données existantes
INSERT INTO "_ExtraSlotServices" ("A", "B")
SELECT "id", "service_id" FROM "extra_slots"
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "extra_slots" DROP CONSTRAINT "extra_slots_service_id_fkey";

-- DropIndex
DROP INDEX "extra_slots_service_id_idx";

-- AlterTable
ALTER TABLE "extra_slots" DROP COLUMN "service_id";
