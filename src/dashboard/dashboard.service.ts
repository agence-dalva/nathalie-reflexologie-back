import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [upcomingBookings, monthBookings, upcomingCount, nextBookings] =
      await Promise.all([
        this.prisma.booking.findMany({
          where: { status: 'CONFIRMED', startsAt: { gte: now } },
          include: { service: true },
        }),
        this.prisma.booking.findMany({
          where: {
            status: 'CONFIRMED',
            startsAt: { gte: startOfMonth, lt: startOfNextMonth },
          },
          include: { service: true },
        }),
        this.prisma.booking.count({
          where: { status: 'CONFIRMED', startsAt: { gte: now } },
        }),
        this.prisma.booking.findMany({
          where: { status: 'CONFIRMED', startsAt: { gte: now } },
          include: { service: true },
          orderBy: { startsAt: 'asc' },
          take: 5,
        }),
      ]);

    const upcomingRevenue = upcomingBookings.reduce(
      (sum, b) => sum + Number(b.service.price),
      0,
    );
    const monthRevenue = monthBookings.reduce(
      (sum, b) => sum + Number(b.service.price),
      0,
    );

    const bookingsByService = new Map<string, number>();
    for (const booking of upcomingBookings) {
      bookingsByService.set(
        booking.service.name,
        (bookingsByService.get(booking.service.name) ?? 0) + 1,
      );
    }

    return {
      upcomingCount,
      upcomingRevenue,
      monthBookingsCount: monthBookings.length,
      monthRevenue,
      nextBookings,
      bookingsByService: Array.from(bookingsByService.entries()).map(
        ([serviceName, count]) => ({ serviceName, count }),
      ),
    };
  }
}
