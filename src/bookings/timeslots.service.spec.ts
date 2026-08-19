import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import {
  BUSINESS_TIMEZONE,
  TimeslotsService,
  type Timeslot,
} from './timeslots.service';

const MONDAY = '2026-06-15';
const WEDNESDAY = '2026-06-17';
const SUNDAY = '2026-06-21';
const MONDAY_WEEKDAY = 0;

const PLANTAIRE = 1;
const PALMAIRE = 2;

type FakeService = {
  id: number;
  durationMinutes: number;
  bufferMinutes: number;
};

type FakeBooking = {
  id: number;
  status: 'CONFIRMED' | 'CANCELLED';
  startsAt: Date;
  endsAt: Date;
  bufferMinutes: number;
};

/** Le `where` que TimeslotsService construit pour lire les rendez-vous. */
type BookingWhere = {
  status: FakeBooking['status'];
  startsAt: { lt: Date };
  endsAt: { gt: Date };
  id?: { not: number };
};

type World = {
  services: FakeService[];
  availabilities: { weekday: number; startTime: string; endTime: string }[];
  exceptions: {
    date: string;
    isClosed: boolean;
    startTime: string | null;
    endTime: string | null;
    source: string;
  }[];
  extraSlots: {
    date: string;
    startTime: string;
    endTime: string;
    serviceIds: number[];
  }[];
  bookings: FakeBooking[];
};

/** Un instant, exprimé à l'heure du cabinet. */
function paris(dateStr: string, time: string): Date {
  return fromZonedTime(`${dateStr}T${time}:00`, BUSINESS_TIMEZONE);
}

/** Les heures de début des créneaux, telles qu'un client les voit. */
function startTimes(slots: Timeslot[]): string[] {
  return slots.map((slot) =>
    formatInTimeZone(slot.startsAt, BUSINESS_TIMEZONE, 'HH:mm'),
  );
}

function createWorld(): World {
  return {
    services: [
      { id: PLANTAIRE, durationMinutes: 60, bufferMinutes: 0 },
      { id: PALMAIRE, durationMinutes: 60, bufferMinutes: 0 },
    ],
    availabilities: [],
    exceptions: [],
    extraSlots: [],
    bookings: [],
  };
}

function createTimeslotsService(world: World): TimeslotsService {
  const prisma = {
    booking: {
      findMany: ({ where }: { where: BookingWhere }) =>
        Promise.resolve(
          world.bookings
            .filter((booking) => booking.status === where.status)
            .filter((booking) => booking.startsAt < where.startsAt.lt)
            .filter((booking) => booking.endsAt > where.endsAt.gt)
            .filter((booking) => !where.id || booking.id !== where.id.not)
            .map((booking) => ({
              startsAt: booking.startsAt,
              endsAt: booking.endsAt,
              service: { bufferMinutes: booking.bufferMinutes },
            })),
        ),
    },
  };

  const availabilityService = {
    findAllAvailabilities: () => Promise.resolve(world.availabilities),
    findAllExceptions: () => Promise.resolve(world.exceptions),
    findAllExtraSlots: () => Promise.resolve(world.extraSlots),
  };

  const servicesService = {
    findOne: (id: number) => {
      const service = world.services.find((s) => s.id === id);
      return service
        ? Promise.resolve(service)
        : Promise.reject(new Error('Prestation introuvable'));
    },
  };

  return new TimeslotsService(
    prisma as unknown as PrismaService,
    availabilityService as unknown as AvailabilityService,
    servicesService as unknown as ServicesService,
  );
}

describe('TimeslotsService', () => {
  let world: World;
  let service: TimeslotsService;

  function setService(
    id: number,
    durationMinutes: number,
    bufferMinutes: number,
  ) {
    const existing = world.services.find((s) => s.id === id)!;
    existing.durationMinutes = durationMinutes;
    existing.bufferMinutes = bufferMinutes;
  }

  function openWeekday(weekday: number, startTime: string, endTime: string) {
    world.availabilities.push({ weekday, startTime, endTime });
  }

  function closeDate(date: string, source = 'MANUAL') {
    world.exceptions.push({
      date,
      isClosed: true,
      startTime: null,
      endTime: null,
      source,
    });
  }

  function changeHours(date: string, startTime: string, endTime: string) {
    world.exceptions.push({
      date,
      isClosed: false,
      startTime,
      endTime,
      source: 'MANUAL',
    });
  }

  function addExtraSlot(
    date: string,
    startTime: string,
    endTime: string,
    serviceIds: number[] = [PLANTAIRE],
  ) {
    world.extraSlots.push({ date, startTime, endTime, serviceIds });
  }

  function book(
    date: string,
    startTime: string,
    endTime: string,
    options: { id?: number; bufferMinutes?: number; cancelled?: boolean } = {},
  ) {
    world.bookings.push({
      id: options.id ?? world.bookings.length + 1,
      status: options.cancelled ? 'CANCELLED' : 'CONFIRMED',
      startsAt: paris(date, startTime),
      endsAt: paris(date, endTime),
      bufferMinutes: options.bufferMinutes ?? 0,
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    // Bien avant les dates de test : rien n'est filtré comme déjà passé.
    jest.setSystemTime(new Date('2026-06-01T06:00:00Z'));
    world = createWorld();
    service = createTimeslotsService(world);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────
  // A. Horaires récurrents
  // ─────────────────────────────────────────────────────────────
  describe('horaires récurrents', () => {
    it('1. découpe la journée en séances de la durée de la prestation', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual([
        '09:00',
        '10:00',
        '11:00',
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
      ]);
    });

    it('2. intercale le battement entre deux séances et ne déborde pas de la plage', async () => {
      setService(PLANTAIRE, 60, 15);
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual([
        '09:00',
        '10:15',
        '11:30',
        '12:45',
        '14:00',
        '15:15',
        '16:30',
      ]);
      // 17:45 + 60 + 15 dépasserait 18:00.
      expect(startTimes(slots)).not.toContain('17:45');
    });

    it('3. ne propose aucun créneau à cheval sur la coupure de midi', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '12:00');
      openWeekday(MONDAY_WEEKDAY, '14:00', '18:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual([
        '09:00',
        '10:00',
        '11:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
      ]);
    });

    it('4. ne propose rien un jour sans horaire', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, SUNDAY);

      expect(slots).toEqual([]);
    });

    it('5. retire les créneaux déjà passés du jour même', async () => {
      jest.setSystemTime(paris(MONDAY, '11:30'));
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual([
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // B. Rendez-vous déjà posés (en ligne ou saisis au back-office)
  // ─────────────────────────────────────────────────────────────
  describe('rendez-vous déjà posés', () => {
    it('6. retire le créneau occupé par un rendez-vous confirmé', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      book(MONDAY, '10:00', '11:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).not.toContain('10:00');
      expect(startTimes(slots)).toHaveLength(8);
    });

    it('7. rend le créneau à nouveau réservable après annulation', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      book(MONDAY, '10:00', '11:00', { cancelled: true });

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toContain('10:00');
      expect(startTimes(slots)).toHaveLength(9);
    });

    it("8. retire tous les créneaux qu'un rendez-vous d'une autre prestation recouvre", async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      // Une palmaire de 90 min saisie à la main, sur une grille différente.
      book(MONDAY, '09:00', '10:30');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual([
        '11:00',
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
      ]);
    });

    it('9. retire les deux créneaux chevauchés par un rendez-vous décalé sur la grille', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      book(MONDAY, '10:15', '11:15');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).not.toContain('10:00');
      expect(startTimes(slots)).not.toContain('11:00');
      expect(startTimes(slots)).toContain('09:00');
      expect(startTimes(slots)).toContain('12:00');
    });

    it('10. fait tenir le battement entre la séance proposée et le rendez-vous voisin', async () => {
      setService(PLANTAIRE, 60, 15);
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      // Rendez-vous saisi à la main hors grille : 09:00 finirait à 10:00 pile,
      // sans le quart d'heure de battement avant le client suivant.
      book(MONDAY, '10:00', '11:00', { bufferMinutes: 15 });

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).not.toContain('09:00');
      expect(startTimes(slots)).toEqual([
        '11:30',
        '12:45',
        '14:00',
        '15:15',
        '16:30',
      ]);
    });

    it('11. laisse son propre créneau à un rendez-vous en cours de modification', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      book(MONDAY, '10:00', '11:00', { id: 42 });

      const slots = await service.getAvailableTimeslots(
        PLANTAIRE,
        MONDAY,
        undefined,
        42,
      );

      expect(startTimes(slots)).toContain('10:00');
      expect(startTimes(slots)).toHaveLength(9);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // C. Congés et horaires modifiés
  // ─────────────────────────────────────────────────────────────
  describe('congés et horaires modifiés', () => {
    it('12. ferme complètement un jour de congé', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      closeDate(MONDAY);

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(slots).toEqual([]);
    });

    it('13. borne la journée aux horaires modifiés et ignore les horaires habituels', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      changeHours(MONDAY, '10:00', '14:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['10:00', '11:00', '12:00', '13:00']);
    });

    it('14. ferme un jour férié importé', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      closeDate(MONDAY, 'HOLIDAY');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(slots).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // D. Créneaux ponctuels : ils pilotent la journée
  // ─────────────────────────────────────────────────────────────
  describe('créneaux ponctuels', () => {
    it('15. remplace les horaires habituels de la journée', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      addExtraSlot(MONDAY, '11:00', '12:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['11:00']);
    });

    it('16. ouvre exactement les plages posées, et rien entre elles', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      addExtraSlot(MONDAY, '11:00', '12:00');
      addExtraSlot(MONDAY, '15:00', '16:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['11:00', '15:00']);
    });

    it('17. ouvre un jour normalement fermé', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      addExtraSlot(WEDNESDAY, '14:00', '15:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, WEDNESDAY);

      expect(startTimes(slots)).toEqual(['14:00']);
    });

    it('18. prime sur un jour de congé', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      closeDate(MONDAY);
      addExtraSlot(MONDAY, '11:00', '12:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['11:00']);
    });

    it('19. prime sur des horaires modifiés', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      changeHours(MONDAY, '10:00', '14:00');
      addExtraSlot(MONDAY, '16:00', '17:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['16:00']);
    });

    it('20. ferme la journée aux prestations non cochées sur le créneau', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      addExtraSlot(MONDAY, '11:00', '12:00', [PLANTAIRE]);

      const slots = await service.getAvailableTimeslots(PALMAIRE, MONDAY);

      expect(slots).toEqual([]);
    });

    it('20 bis. reste ouvert à toutes les prestations cochées', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      addExtraSlot(MONDAY, '11:00', '12:00', [PLANTAIRE, PALMAIRE]);

      const slots = await service.getAvailableTimeslots(PALMAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['11:00']);
    });

    it('21. ne propose rien si la plage est déjà réservée', async () => {
      addExtraSlot(MONDAY, '11:00', '12:00');
      book(MONDAY, '11:00', '12:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(slots).toEqual([]);
    });

    it('22. accepte une séance qui déborde de la plage posée', async () => {
      addExtraSlot(MONDAY, '11:00', '11:30');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['11:00']);
      expect(slots[0].endsAt).toEqual(paris(MONDAY, '12:00'));
    });

    it('23. dédoublonne deux plages qui se chevauchent', async () => {
      addExtraSlot(MONDAY, '11:00', '12:00');
      addExtraSlot(MONDAY, '11:00', '13:00');

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['11:00', '12:00']);
    });

    it("24. n'impose pas le battement : elle le gère elle-même sur ces plages", async () => {
      setService(PLANTAIRE, 60, 15);
      addExtraSlot(MONDAY, '11:00', '12:00');
      // Collé avant et après, sans le quart d'heure habituel : sur les horaires
      // récurrents ces deux rendez-vous feraient sauter le créneau.
      book(MONDAY, '10:00', '11:00', { bufferMinutes: 15 });
      book(MONDAY, '12:00', '13:00', { bufferMinutes: 15 });

      const slots = await service.getAvailableTimeslots(PLANTAIRE, MONDAY);

      expect(startTimes(slots)).toEqual(['11:00']);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E. Jours ouvrables du calendrier
  // ─────────────────────────────────────────────────────────────
  describe('getAvailableDays', () => {
    it('25. ne retient que les jours portant au moins un créneau', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');

      const days = await service.getAvailableDays(PLANTAIRE, MONDAY, 7);

      expect(days).toEqual([MONDAY]);
    });

    it('26. ajoute les jours ouverts par un créneau ponctuel', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      addExtraSlot(WEDNESDAY, '14:00', '15:00');

      const days = await service.getAvailableDays(PLANTAIRE, MONDAY, 7);

      expect(days).toEqual([MONDAY, WEDNESDAY]);
    });

    it('27. retire un jour fermé par un congé', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      closeDate(MONDAY);

      const days = await service.getAvailableDays(PLANTAIRE, MONDAY, 7);

      expect(days).toEqual([]);
    });

    it('28. retire un jour dont les créneaux ponctuels visent une autre prestation', async () => {
      openWeekday(MONDAY_WEEKDAY, '09:00', '18:00');
      addExtraSlot(MONDAY, '11:00', '12:00', [PALMAIRE]);

      const days = await service.getAvailableDays(PLANTAIRE, MONDAY, 7);

      expect(days).toEqual([]);
    });
  });
});
