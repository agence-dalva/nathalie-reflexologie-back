import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { addMinutes } from 'date-fns';
import type { Booking, Service } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { TimeslotsService, toBusinessDateKey } from './timeslots.service';
import { ClientsService } from '../clients/clients.service';

type BookingWithService = Booking & { service: Service };

const POSTGRES_EXCLUSION_VIOLATION = '23P01';
const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servicesService: ServicesService,
    private readonly timeslotsService: TimeslotsService,
    private readonly clientsService: ClientsService,
  ) {}

  async getAvailableTimeslots(serviceId: number, date: string) {
    return this.timeslotsService.getAvailableTimeslots(serviceId, date);
  }

  async getAvailableDays(serviceId: number, from: string, dayCount: number) {
    return this.timeslotsService.getAvailableDays(serviceId, from, dayCount);
  }

  async create(
    dto: CreateBookingDto,
    idempotencyKey?: string,
  ): Promise<{ booking: BookingWithService; isNew: boolean }> {
    if (idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({
        where: { idempotencyKey },
        include: { service: true },
      });
      if (existing) {
        assertSameRequest(existing, dto);
        return { booking: existing, isNew: false };
      }
    }

    const service = await this.servicesService.findOne(dto.serviceId);
    if (!service.active) {
      throw new BadRequestException('Cette prestation n’est plus disponible');
    }

    const address = dto.address?.trim();
    if (service.requiresAddress && !address) {
      throw new BadRequestException(
        'L’adresse du rendez-vous est requise pour cette prestation',
      );
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = addMinutes(startsAt, service.durationMinutes);

    const client = await this.clientsService.upsertFromBooking({
      firstname: dto.customerFirstname,
      lastname: dto.customerLastname,
      email: dto.customerEmail,
      phone: dto.customerPhone,
    });

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        const availableSlots =
          await this.timeslotsService.getAvailableTimeslots(
            dto.serviceId,
            toBusinessDateKey(startsAt),
            tx,
          );
        const slotIsAvailable = availableSlots.some(
          (slot) => slot.startsAt.getTime() === startsAt.getTime(),
        );
        if (!slotIsAvailable) {
          throw new ConflictException(
            'Ce créneau n’est plus disponible, merci d’en choisir un autre',
          );
        }

        return tx.booking.create({
          data: {
            serviceId: dto.serviceId,
            clientId: client.id,
            customerFirstname: dto.customerFirstname,
            customerLastname: dto.customerLastname,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone,
            beneficiaryFirstname: dto.beneficiaryFirstname,
            beneficiaryLastname: dto.beneficiaryLastname,
            beneficiaryPhone: dto.beneficiaryPhone,
            // Une séance au cabinet n'a pas d'adresse propre, même si le
            // formulaire en a envoyé une.
            address: service.requiresAddress ? address : null,
            notes: dto.notes,
            startsAt,
            endsAt,
            idempotencyKey,
          },
          include: { service: true },
        });
      });
      return { booking, isNew: true };
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictException(
          'Ce créneau vient d’être réservé par quelqu’un d’autre, merci d’en choisir un autre',
        );
      }
      if (idempotencyKey && isUniqueViolation(error)) {
        // Deux requêtes concurrentes avec la même Idempotency-Key : l'une a gagné, on relit son résultat.
        const winner = await this.prisma.booking.findUnique({
          where: { idempotencyKey },
          include: { service: true },
        });
        if (winner) {
          assertSameRequest(winner, dto);
          return { booking: winner, isNew: false };
        }
      }
      throw error;
    }
  }

  findAllAdmin(params: { from?: string; to?: string }) {
    return this.prisma.booking.findMany({
      where: {
        startsAt: {
          gte: params.from ? new Date(params.from) : undefined,
          lte: params.to ? new Date(params.to) : undefined,
        },
      },
      include: { service: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  async findOneAdmin(id: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { service: true },
    });
    if (!booking) {
      throw new NotFoundException('Réservation introuvable');
    }
    return booking;
  }

  async findByCancelToken(cancelToken: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { cancelToken },
      include: { service: true },
    });
    if (!booking) {
      throw new NotFoundException('Réservation introuvable');
    }
    return booking;
  }

  async cancelByToken(cancelToken: string) {
    const booking = await this.findByCancelToken(cancelToken);
    if (booking.status === 'CANCELLED') {
      return booking;
    }
    return this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
      include: { service: true },
    });
  }

  async cancelAdmin(id: number) {
    const booking = await this.findOneAdmin(id);
    if (booking.status === 'CANCELLED') {
      return booking;
    }
    return this.prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { service: true },
    });
  }

  async updateAdmin(
    id: number,
    dto: UpdateBookingDto,
  ): Promise<BookingWithService> {
    const existing = await this.findOneAdmin(id);
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException(
        'Impossible de modifier une réservation annulée',
      );
    }

    const serviceId = dto.serviceId ?? existing.serviceId;
    const service = await this.servicesService.findOne(serviceId);
    if (!service.active) {
      throw new BadRequestException('Cette prestation n’est plus disponible');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = addMinutes(startsAt, service.durationMinutes);
    const dateStr = toBusinessDateKey(startsAt);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const availableSlots =
          await this.timeslotsService.getAvailableTimeslots(
            serviceId,
            dateStr,
            tx,
            id,
          );
        const slotIsAvailable = availableSlots.some(
          (slot) => slot.startsAt.getTime() === startsAt.getTime(),
        );
        if (!slotIsAvailable) {
          throw new ConflictException(
            'Ce créneau n’est plus disponible, merci d’en choisir un autre',
          );
        }

        return tx.booking.update({
          where: { id },
          data: { serviceId, startsAt, endsAt },
          include: { service: true },
        });
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictException(
          'Ce créneau vient d’être réservé par quelqu’un d’autre, merci d’en choisir un autre',
        );
      }
      throw error;
    }
  }
}

/**
 * Une Idempotency-Key ne rejoue que la demande qui l'a créée. Réutilisée pour
 * un autre créneau ou un autre client, on renvoyait l'ancienne réservation :
 * l'écran disait « confirmé » alors que rien n'était créé ni envoyé.
 */
function assertSameRequest(existing: Booking, dto: CreateBookingDto): void {
  const sameRequest =
    existing.serviceId === dto.serviceId &&
    existing.startsAt.getTime() === new Date(dto.startsAt).getTime() &&
    existing.customerEmail.trim().toLowerCase() ===
      dto.customerEmail.trim().toLowerCase();
  if (!sameRequest) {
    throw new UnprocessableEntityException(
      'Cette demande de réservation a expiré, merci de recharger la page et de réessayer',
    );
  }
}

function isExclusionViolation(error: unknown): boolean {
  return hasPostgresCode(error, POSTGRES_EXCLUSION_VIOLATION);
}

function isUniqueViolation(error: unknown): boolean {
  return hasPostgresCode(error, POSTGRES_UNIQUE_VIOLATION);
}

function hasPostgresCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}
