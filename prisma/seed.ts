import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const services = [
  {
    name: 'Réflexologie plantaire',
    description: 'Séance de réflexologie plantaire, environ 1h.',
    durationMinutes: 60,
    bufferMinutes: 15,
    price: 60,
  },
  {
    name: 'Réflexologie palmaire',
    description: 'Séance de réflexologie palmaire, environ 1h.',
    durationMinutes: 60,
    bufferMinutes: 15,
    price: 60,
  },
  {
    name: 'Réflexologie crânio-faciale',
    description: 'Séance de réflexologie crânio-faciale, 50 à 60 minutes.',
    durationMinutes: 60,
    bufferMinutes: 15,
    price: 60,
  },
  {
    name: 'Réflexologie plantaire + palmaire',
    description: 'Combinaison réflexologie plantaire et palmaire, 1h15.',
    durationMinutes: 75,
    bufferMinutes: 15,
    price: 70,
  },
  {
    name: 'Réflexologie crânio-faciale + palmaire',
    description: 'Combinaison réflexologie crânio-faciale et palmaire, 1h15.',
    durationMinutes: 75,
    bufferMinutes: 15,
    price: 70,
  },
  {
    name: 'Forfait 4 séances — suivi réflexologie plantaire',
    description:
      'Forfait de 4 séances de réflexologie plantaire, à utiliser dans les 3 mois suivant la première séance.',
    durationMinutes: 60,
    bufferMinutes: 15,
    price: 200,
  },
  {
    name: 'Réflexologie plantaire — accompagnement oncologie',
    description: 'Séance de réflexologie plantaire spéciale accompagnement oncologie, environ 1h.',
    durationMinutes: 60,
    bufferMinutes: 15,
    price: 60,
  },
  {
    name: 'Réflexologie plantaire bébé / enfant (jusqu\'à 11 ans)',
    description: 'Séance adaptée aux bébés et enfants jusqu\'à 11 ans, 20 à 30 minutes.',
    durationMinutes: 30,
    bufferMinutes: 15,
    price: 30,
  },
  {
    name: 'Réflexologie plantaire + massage assis',
    description: 'Réflexologie plantaire suivie d\'un massage assis, 1h20.',
    durationMinutes: 80,
    bufferMinutes: 15,
    price: 85,
  },
  {
    name: 'Réflexologie crânio-faciale + massage assis',
    description: 'Réflexologie crânio-faciale suivie d\'un massage assis, 1h20.',
    durationMinutes: 80,
    bufferMinutes: 15,
    price: 85,
  },
  {
    name: 'Réflexologie plantaire à domicile',
    description:
      'À domicile dans un rayon de 10 km autour d\'Altkirch (au-delà, tarif sur demande), environ 1h.',
    durationMinutes: 60,
    bufferMinutes: 30,
    price: 65,
  },
  {
    name: 'Massage assis',
    description: 'Massage assis seul, 15 à 20 minutes, effectué habillé sur une chaise ergonomique.',
    durationMinutes: 20,
    bufferMinutes: 10,
    price: 30,
  },
];

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_SEED_EMAIL et ADMIN_SEED_PASSWORD doivent être définis dans .env');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: 'Nathalie' },
  });

  console.log(`Compte admin prêt : ${admin.email}`);

  for (const service of services) {
    const existing = await prisma.service.findFirst({
      where: { name: service.name },
    });
    if (existing) {
      await prisma.service.update({ where: { id: existing.id }, data: service });
    } else {
      await prisma.service.create({ data: service });
    }
  }

  console.log(`${services.length} prestations à jour.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
