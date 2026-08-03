-- AlterTable
ALTER TABLE "services" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- Initialize order from current alphabetical ranking so existing display order is preserved
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "name" ASC) - 1 AS rn
  FROM "services"
)
UPDATE "services"
SET "order" = ranked.rn
FROM ranked
WHERE "services"."id" = ranked."id";
