-- Les prestations à domicile déjà en base demandent désormais l'adresse du client.
UPDATE "services" SET "requires_address" = true WHERE "name" ILIKE '%domicile%';
