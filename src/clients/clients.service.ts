import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
