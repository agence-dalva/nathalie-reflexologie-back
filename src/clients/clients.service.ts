import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportClientDto } from './dto/import-clients.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { bookings: true } },
      },
    });
  }

  async findOne(id: number) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        bookings: {
          include: { service: true },
          orderBy: { startsAt: 'desc' },
        },
      },
    });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }
    return client;
  }

  /**
   * Import en masse depuis un export CSV. Volontairement non destructif : une
   * fiche déjà présente n'est jamais écrasée, on complète seulement son
   * téléphone s'il manquait.
   */
  async importMany(rows: ImportClientDto[]) {
    // Dédoublonnage par email (la dernière ligne du fichier gagne).
    const byEmail = new Map<string, ImportClientDto>();
    for (const row of rows) {
      byEmail.set(row.email.trim().toLowerCase(), {
        firstname: row.firstname.trim(),
        lastname: row.lastname.trim(),
        email: row.email.trim().toLowerCase(),
        phone: row.phone?.trim() || undefined,
        importedBookingsCount: row.importedBookingsCount,
        importedLastBookingAt: row.importedLastBookingAt,
      });
    }

    const existing = await this.prisma.client.findMany({
      where: { email: { in: [...byEmail.keys()] } },
      select: {
        id: true,
        email: true,
        phone: true,
        importedBookingsCount: true,
        importedLastBookingAt: true,
      },
    });
    const existingByEmail = new Map(existing.map((c) => [c.email, c]));

    const toCreate: ImportClientDto[] = [];
    const updates: { id: number; data: Prisma.ClientUpdateInput }[] = [];

    for (const [email, row] of byEmail) {
      const match = existingByEmail.get(email);
      if (!match) {
        toCreate.push(row);
        continue;
      }

      // Fiche existante : on ne touche jamais au nom. Le téléphone n'est
      // complété que s'il manquait ; l'historique importé, lui, vient toujours
      // du fichier et peut donc être rafraîchi à chaque import.
      const data: Prisma.ClientUpdateInput = {};
      if (!match.phone && row.phone) {
        data.phone = row.phone;
      }
      const count = row.importedBookingsCount ?? null;
      if (count !== null && count !== match.importedBookingsCount) {
        data.importedBookingsCount = count;
      }
      const lastBookingAt = row.importedLastBookingAt
        ? new Date(row.importedLastBookingAt)
        : null;
      if (
        lastBookingAt &&
        lastBookingAt.getTime() !== match.importedLastBookingAt?.getTime()
      ) {
        data.importedLastBookingAt = lastBookingAt;
      }

      if (Object.keys(data).length > 0) {
        updates.push({ id: match.id, data });
      }
    }

    if (toCreate.length > 0) {
      await this.prisma.client.createMany({
        data: toCreate.map((row) => ({
          firstname: row.firstname,
          lastname: row.lastname,
          email: row.email,
          phone: row.phone,
          importedBookingsCount: row.importedBookingsCount,
          importedLastBookingAt: row.importedLastBookingAt
            ? new Date(row.importedLastBookingAt)
            : undefined,
        })),
        skipDuplicates: true,
      });
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map(({ id, data }) =>
          this.prisma.client.update({ where: { id }, data }),
        ),
      );
    }

    return {
      created: toCreate.length,
      updated: updates.length,
      unchanged: byEmail.size - toCreate.length - updates.length,
    };
  }

  /**
   * Rattache une réservation à un client existant (par email) ou en crée un
   * nouveau. Appelé à chaque création de réservation, publique ou admin.
   */
  async upsertFromBooking(data: {
    firstname: string;
    lastname: string;
    email: string;
    phone?: string;
  }) {
    return this.prisma.client.upsert({
      where: { email: data.email },
      create: {
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email,
        phone: data.phone,
      },
      update: {
        firstname: data.firstname,
        lastname: data.lastname,
        ...(data.phone ? { phone: data.phone } : {}),
      },
    });
  }
}
