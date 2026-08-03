import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExceptionSource } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { CreateExceptionRangeDto } from './dto/create-exception-range.dto';
import { CreateExtraSlotDto } from './dto/create-extra-slot.dto';
import { dateToTimeString, timeStringToDate } from './time.util';
import { getFrenchPublicHolidays } from './french-holidays.util';

function serializeAvailability(availability: {
  id: number;
  weekday: number;
  startTime: Date;
  endTime: Date;
}) {
  return {
    id: availability.id,
    weekday: availability.weekday,
    startTime: dateToTimeString(availability.startTime),
    endTime: dateToTimeString(availability.endTime),
  };
}

function serializeException(exception: {
  id: number;
  date: Date;
  isClosed: boolean;
  startTime: Date | null;
  endTime: Date | null;
  source: ExceptionSource;
}) {
  return {
    id: exception.id,
    date: exception.date.toISOString().slice(0, 10),
    isClosed: exception.isClosed,
    startTime: exception.startTime
      ? dateToTimeString(exception.startTime)
      : null,
    endTime: exception.endTime ? dateToTimeString(exception.endTime) : null,
    source: exception.source,
  };
}

function serializeExtraSlot(extraSlot: {
  id: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  serviceId: number;
}) {
  return {
    id: extraSlot.id,
    date: extraSlot.date.toISOString().slice(0, 10),
    startTime: dateToTimeString(extraSlot.startTime),
    endTime: dateToTimeString(extraSlot.endTime),
    serviceId: extraSlot.serviceId,
  };
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAvailabilities() {
    const availabilities = await this.prisma.availability.findMany({
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    return availabilities.map(serializeAvailability);
  }

  async createAvailability(dto: CreateAvailabilityDto) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime doit être avant endTime');
    }

    const availability = await this.prisma.availability.create({
      data: {
        weekday: dto.weekday,
        startTime: timeStringToDate(dto.startTime),
        endTime: timeStringToDate(dto.endTime),
      },
    });
    return serializeAvailability(availability);
  }

  async removeAvailability(id: number) {
    const existing = await this.prisma.availability.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Créneau récurrent introuvable');
    }
    await this.prisma.availability.delete({ where: { id } });
  }

  async findAllExceptions() {
    const exceptions = await this.prisma.exception.findMany({
      orderBy: { date: 'asc' },
    });
    return exceptions.map(serializeException);
  }

  async createException(dto: CreateExceptionDto) {
    this.validateExceptionTimes(dto.isClosed, dto.startTime, dto.endTime);
    const exception = await this.upsertException(
      dto.date,
      dto.isClosed,
      dto.startTime,
      dto.endTime,
    );
    return serializeException(exception);
  }

  async createExceptionRange(dto: CreateExceptionRangeDto) {
    this.validateExceptionTimes(dto.isClosed, dto.startTime, dto.endTime);

    const start = new Date(`${dto.startDate}T00:00:00.000Z`);
    const end = new Date(`${dto.endDate}T00:00:00.000Z`);
    if (start > end) {
      throw new BadRequestException(
        'startDate doit être avant ou égal à endDate',
      );
    }

    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const exceptions = await Promise.all(
      dates.map((date) =>
        this.upsertException(date, dto.isClosed, dto.startTime, dto.endTime),
      ),
    );
    return exceptions.map(serializeException);
  }

  async importFrenchHolidays(year: number) {
    const holidays = getFrenchPublicHolidays(year);
    const exceptions = await Promise.all(
      holidays.map((holiday) =>
        this.upsertException(
          holiday.date,
          true,
          undefined,
          undefined,
          ExceptionSource.HOLIDAY,
        ),
      ),
    );
    return exceptions.map(serializeException);
  }

  async removeAllExceptions(source?: ExceptionSource) {
    const { count } = await this.prisma.exception.deleteMany({
      where: source ? { source } : undefined,
    });
    return { count };
  }

  async removeException(id: number) {
    const existing = await this.prisma.exception.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Exception introuvable');
    }
    await this.prisma.exception.delete({ where: { id } });
  }

  private validateExceptionTimes(
    isClosed: boolean,
    startTime?: string,
    endTime?: string,
  ) {
    if (!isClosed && (!startTime || !endTime)) {
      throw new BadRequestException(
        'startTime et endTime sont requis pour un jour aux horaires modifiés',
      );
    }
    if (startTime && endTime && startTime >= endTime) {
      throw new BadRequestException('startTime doit être avant endTime');
    }
  }

  private async upsertException(
    date: string,
    isClosed: boolean,
    startTime?: string,
    endTime?: string,
    source: ExceptionSource = ExceptionSource.MANUAL,
  ) {
    return this.prisma.exception.upsert({
      where: { date: new Date(date) },
      create: {
        date: new Date(date),
        isClosed,
        startTime: startTime ? timeStringToDate(startTime) : null,
        endTime: endTime ? timeStringToDate(endTime) : null,
        source,
      },
      update: {
        isClosed,
        startTime: startTime ? timeStringToDate(startTime) : null,
        endTime: endTime ? timeStringToDate(endTime) : null,
        source,
      },
    });
  }

  async findAllExtraSlots() {
    const extraSlots = await this.prisma.extraSlot.findMany({
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return extraSlots.map(serializeExtraSlot);
  }

  async createExtraSlot(dto: CreateExtraSlotDto) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime doit être avant endTime');
    }

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service) {
      throw new NotFoundException('Prestation introuvable');
    }

    const extraSlot = await this.prisma.extraSlot.create({
      data: {
        date: new Date(dto.date),
        startTime: timeStringToDate(dto.startTime),
        endTime: timeStringToDate(dto.endTime),
        serviceId: dto.serviceId,
      },
    });
    return serializeExtraSlot(extraSlot);
  }

  async removeExtraSlot(id: number) {
    const existing = await this.prisma.extraSlot.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Créneau ponctuel introuvable');
    }
    await this.prisma.extraSlot.delete({ where: { id } });
  }
}
