import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { dateToTimeString, timeStringToDate } from './time.util';

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
}) {
  return {
    id: exception.id,
    date: exception.date.toISOString().slice(0, 10),
    isClosed: exception.isClosed,
    startTime: exception.startTime ? dateToTimeString(exception.startTime) : null,
    endTime: exception.endTime ? dateToTimeString(exception.endTime) : null,
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
    const existing = await this.prisma.availability.findUnique({ where: { id } });
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
    if (!dto.isClosed && (!dto.startTime || !dto.endTime)) {
      throw new BadRequestException(
        'startTime et endTime sont requis pour un jour aux horaires modifiés',
      );
    }
    if (dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime doit être avant endTime');
    }

    const exception = await this.prisma.exception.upsert({
      where: { date: new Date(dto.date) },
      create: {
        date: new Date(dto.date),
        isClosed: dto.isClosed,
        startTime: dto.startTime ? timeStringToDate(dto.startTime) : null,
        endTime: dto.endTime ? timeStringToDate(dto.endTime) : null,
      },
      update: {
        isClosed: dto.isClosed,
        startTime: dto.startTime ? timeStringToDate(dto.startTime) : null,
        endTime: dto.endTime ? timeStringToDate(dto.endTime) : null,
      },
    });
    return serializeException(exception);
  }

  async removeException(id: number) {
    const existing = await this.prisma.exception.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Exception introuvable');
    }
    await this.prisma.exception.delete({ where: { id } });
  }
}
