import { Injectable } from '@nestjs/common';
import { addDays, addMinutes, isBefore } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
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
    const slotLengthMinutes = service.durationMinutes + service.bufferMinutes;

    const openRanges = await this.getOpenRangesForDate(dateStr);
    if (openRanges.length === 0) {
      return [];
    }

    const dayStart = fromZonedTime(`${dateStr}T00:00:00`, BUSINESS_TIMEZONE);
    const dayEnd = fromZonedTime(`${dateStr}T23:59:59`, BUSINESS_TIMEZONE);

    const existingBookings = await client.booking.findMany({
      where: {
        status: 'CONFIRMED',
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    });

    const now = new Date();
    const candidateSlots: Timeslot[] = [];

    for (const range of openRanges) {
      let cursor = range.start;
      while (true) {
        const slotEnd = addMinutes(cursor, slotLengthMinutes);
        if (isBefore(range.end, slotEnd)) {
          break;
        }

        const appointmentEnd = addMinutes(cursor, service.durationMinutes);
        candidateSlots.push({ startsAt: cursor, endsAt: appointmentEnd });
        cursor = slotEnd;
      }
    }

    return candidateSlots.filter((slot) => {
      if (isBefore(slot.startsAt, now)) {
        return false;
      }
      return !existingBookings.some(
        (booking) => slot.startsAt < booking.endsAt && booking.startsAt < slot.endsAt,
      );
    });
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
    const [year, month, day] = startDateStr.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, day));

    const availableDays: string[] = [];
    for (let i = 0; i < dayCount; i++) {
      const dateStr = this.toDateKey(addDays(startDate, i));
      const slots = await this.getAvailableTimeslots(serviceId, dateStr);
      if (slots.length > 0) {
        availableDays.push(dateStr);
      }
    }
    return availableDays;
  }

  private toDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async getOpenRangesForDate(
    dateStr: string,
  ): Promise<Array<{ start: Date; end: Date }>> {
    const exceptions = await this.availabilityService.findAllExceptions();
    const exception = exceptions.find((e) => e.date === dateStr);

    if (exception) {
      if (exception.isClosed || !exception.startTime || !exception.endTime) {
        return [];
      }
      return [
        {
          start: this.toBusinessDateTime(dateStr, exception.startTime),
          end: this.toBusinessDateTime(dateStr, exception.endTime),
        },
      ];
    }

    const weekday = this.getWeekday(dateStr);
    const availabilities = await this.availabilityService.findAllAvailabilities();
    return availabilities
      .filter((a) => a.weekday === weekday)
      .map((a) => ({
        start: this.toBusinessDateTime(dateStr, a.startTime),
        end: this.toBusinessDateTime(dateStr, a.endTime),
      }));
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
    const zoned = toZonedTime(fromZonedTime(`${dateStr}T12:00:00`, BUSINESS_TIMEZONE), BUSINESS_TIMEZONE);
    const jsDay = zoned.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }
}
