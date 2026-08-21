import { Injectable } from '@nestjs/common';
import { addDays, addMinutes, isBefore } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import type { Prisma } from '../../generated/prisma/client';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

export const BUSINESS_TIMEZONE = 'Europe/Paris';

export interface Timeslot {
  startsAt: Date;
  endsAt: Date;
}

/** Le jour calendaire correspondant à un instant, vu depuis le cabinet. */
export function toBusinessDateKey(date: Date): string {
  return formatInTimeZone(date, BUSINESS_TIMEZONE, 'yyyy-MM-dd');
}

/** Plage d'ouverture d'une journée, telle qu'utilisée pour découper les créneaux. */
interface OpenRange {
  start: Date;
  end: Date;
  /** Vrai pour un créneau ponctuel : la plage est prise telle quelle, battement compris. */
  isExtraSlot: boolean;
}

/** Créneau candidat, avant confrontation aux rendez-vous déjà posés. */
interface CandidateSlot extends Timeslot {
  isExtraSlot: boolean;
}

/** Rendez-vous confirmé occupant la journée, avec le battement de sa prestation. */
interface BusyBooking {
  startsAt: Date;
  endsAt: Date;
  bufferMinutes: number;
}

/** Les trois tables de disponibilité, relues une seule fois par calcul. */
interface AvailabilityData {
  availabilities: Awaited<
    ReturnType<AvailabilityService['findAllAvailabilities']>
  >;
  exceptions: Awaited<ReturnType<AvailabilityService['findAllExceptions']>>;
  extraSlots: Awaited<ReturnType<AvailabilityService['findAllExtraSlots']>>;
}

function parseTimeOfDay(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

@Injectable()
export class TimeslotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly servicesService: ServicesService,
  ) {}

  async getAvailableTimeslots(
    serviceId: number,
    dateStr: string,
    client: PrismaClientOrTx = this.prisma,
    excludeBookingId?: number,
  ): Promise<Timeslot[]> {
    const service = await this.servicesService.findOne(serviceId);
    const data = await this.loadAvailabilityData();
    const bookings = await this.findBusyBookings(
      client,
      dateStr,
      dateStr,
      excludeBookingId,
    );
    return this.buildSlotsForDate(service, dateStr, data, bookings, new Date());
  }

  /**
   * Renvoie les dates (YYYY-MM-DD) ayant au moins un créneau disponible,
   * sur `dayCount` jours à partir de `startDateStr` inclus.
   */
  async getAvailableDays(
    serviceId: number,
    startDateStr: string,
    dayCount: number,
  ): Promise<string[]> {
    if (dayCount <= 0) {
      return [];
    }

    const dateKeys = Array.from({ length: dayCount }, (_, i) =>
      this.shiftDateKey(startDateStr, i),
    );

    // Le calendrier du front demande souvent deux mois d'un coup : les tables de
    // disponibilité et les rendez-vous de la fenêtre sont lus une seule fois,
    // puis chaque journée est calculée en mémoire.
    const service = await this.servicesService.findOne(serviceId);
    const data = await this.loadAvailabilityData();
    const bookings = await this.findBusyBookings(
      this.prisma,
      dateKeys[0],
      dateKeys[dateKeys.length - 1],
    );

    const now = new Date();
    return dateKeys.filter(
      (dateStr) =>
        this.buildSlotsForDate(service, dateStr, data, bookings, now).length >
        0,
    );
  }

  private buildSlotsForDate(
    service: { id: number; durationMinutes: number; bufferMinutes: number },
    dateStr: string,
    data: AvailabilityData,
    bookings: BusyBooking[],
    now: Date,
  ): Timeslot[] {
    const openRanges = this.getOpenRangesForDate(dateStr, service.id, data);
    if (openRanges.length === 0) {
      return [];
    }

    const slotLengthMinutes = service.durationMinutes + service.bufferMinutes;
    const candidateSlots: CandidateSlot[] = [];

    for (const range of openRanges) {
      // Créneau ponctuel : la plage a été ouverte à la main pour ces prestations
      // précises. Toute heure de début comprise dans la plage est proposée, même
      // si la séance se termine après la fin de la plage, et sans retrancher le
      // battement — c'est elle qui décide en posant le créneau.
      if (range.isExtraSlot) {
        let cursor = range.start;
        while (isBefore(cursor, range.end)) {
          candidateSlots.push({
            startsAt: cursor,
            endsAt: addMinutes(cursor, service.durationMinutes),
            isExtraSlot: true,
          });
          cursor = addMinutes(cursor, service.durationMinutes);
        }
        continue;
      }

      // Horaires récurrents : la séance et son battement doivent tenir dans la plage.
      let cursor = range.start;
      while (true) {
        const slotEnd = addMinutes(cursor, slotLengthMinutes);
        if (isBefore(range.end, slotEnd)) {
          break;
        }

        candidateSlots.push({
          startsAt: cursor,
          endsAt: addMinutes(cursor, service.durationMinutes),
          isExtraSlot: false,
        });
        cursor = slotEnd;
      }
    }

    const bookableSlots = candidateSlots.filter((slot) => {
      if (isBefore(slot.startsAt, now)) {
        return false;
      }
      return !this.conflictsWithBooking(slot, service.bufferMinutes, bookings);
    });

    // Deux créneaux ponctuels peuvent se chevaucher : on dédoublonne par heure
    // de début et on renvoie l'ensemble trié.
    const slotsByStart = new Map<number, Timeslot>();
    for (const slot of bookableSlots) {
      slotsByStart.set(slot.startsAt.getTime(), {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
    }
    return [...slotsByStart.values()].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
  }

  /**
   * Sur les horaires récurrents, le battement doit tenir entre deux séances : on
   * confronte les plages d'occupation réelles, séance + battement de part et
   * d'autre. Sur un créneau ponctuel elle gère son battement elle-même, seul le
   * chevauchement des séances compte.
   */
  private conflictsWithBooking(
    slot: CandidateSlot,
    serviceBufferMinutes: number,
    bookings: BusyBooking[],
  ): boolean {
    const slotEnd = slot.isExtraSlot
      ? slot.endsAt
      : addMinutes(slot.endsAt, serviceBufferMinutes);

    return bookings.some((booking) => {
      const bookingEnd = slot.isExtraSlot
        ? booking.endsAt
        : addMinutes(booking.endsAt, booking.bufferMinutes);
      return slot.startsAt < bookingEnd && booking.startsAt < slotEnd;
    });
  }

  private getOpenRangesForDate(
    dateStr: string,
    serviceId: number,
    data: AvailabilityData,
  ): OpenRange[] {
    const exception = data.exceptions.find((e) => e.date === dateStr);

    // Un jour de congé prime sur tout : elle est en congé, et un créneau
    // ponctuel resté posé sur cette date ne rouvre pas la journée.
    if (exception?.isClosed) {
      return [];
    }

    // Hors congé, poser un créneau ponctuel vaut prise en main de la journée :
    // dès qu'il y en a un, il remplace les horaires récurrents comme les
    // horaires modifiés — y compris un jour normalement fermé. Seules les
    // prestations cochées sur ces créneaux restent réservables ce jour-là.
    const extraSlotsOfDay = data.extraSlots.filter(
      (slot) => slot.date === dateStr,
    );
    if (extraSlotsOfDay.length > 0) {
      return extraSlotsOfDay
        .filter((slot) => slot.serviceIds.includes(serviceId))
        .map((slot) => ({
          start: this.toBusinessDateTime(dateStr, slot.startTime),
          end: this.toBusinessDateTime(dateStr, slot.endTime),
          isExtraSlot: true,
        }));
    }

    if (exception) {
      if (!exception.startTime || !exception.endTime) {
        return [];
      }
      return [
        {
          start: this.toBusinessDateTime(dateStr, exception.startTime),
          end: this.toBusinessDateTime(dateStr, exception.endTime),
          isExtraSlot: false,
        },
      ];
    }

    const weekday = this.getWeekday(dateStr);
    return data.availabilities
      .filter((a) => a.weekday === weekday)
      .map((a) => ({
        start: this.toBusinessDateTime(dateStr, a.startTime),
        end: this.toBusinessDateTime(dateStr, a.endTime),
        isExtraSlot: false,
      }));
  }

  private async loadAvailabilityData(): Promise<AvailabilityData> {
    const [availabilities, exceptions, extraSlots] = await Promise.all([
      this.availabilityService.findAllAvailabilities(),
      this.availabilityService.findAllExceptions(),
      this.availabilityService.findAllExtraSlots(),
    ]);
    return { availabilities, exceptions, extraSlots };
  }

  private async findBusyBookings(
    client: PrismaClientOrTx,
    fromDateStr: string,
    toDateStr: string,
    excludeBookingId?: number,
  ): Promise<BusyBooking[]> {
    // Fenêtre élargie d'un jour de chaque côté : le battement d'un rendez-vous
    // de la veille peut mordre sur le premier créneau du jour demandé.
    const rangeStart = this.toBusinessDateTime(
      this.shiftDateKey(fromDateStr, -1),
      '00:00',
    );
    const rangeEnd = this.toBusinessDateTime(
      this.shiftDateKey(toDateStr, 2),
      '00:00',
    );

    const bookings = await client.booking.findMany({
      where: {
        status: 'CONFIRMED',
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: {
        startsAt: true,
        endsAt: true,
        service: { select: { bufferMinutes: true } },
      },
    });

    return bookings.map((booking) => ({
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      bufferMinutes: booking.service.bufferMinutes,
    }));
  }

  private toDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private shiftDateKey(dateStr: string, days: number): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    return this.toDateKey(
      addDays(new Date(Date.UTC(year, month - 1, day)), days),
    );
  }

  private toBusinessDateTime(dateStr: string, time: string): Date {
    const { hours, minutes } = parseTimeOfDay(time);
    const paddedHours = String(hours).padStart(2, '0');
    const paddedMinutes = String(minutes).padStart(2, '0');
    const composed = `${dateStr}T${paddedHours}:${paddedMinutes}:00`;
    return fromZonedTime(composed, BUSINESS_TIMEZONE);
  }

  private getWeekday(dateStr: string): number {
    // JS getDay(): 0=dimanche...6=samedi. On veut 0=lundi...6=dimanche.
    const zoned = toZonedTime(
      fromZonedTime(`${dateStr}T12:00:00`, BUSINESS_TIMEZONE),
      BUSINESS_TIMEZONE,
    );
    const jsDay = zoned.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }
}
