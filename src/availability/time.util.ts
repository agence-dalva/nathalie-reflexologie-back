// Prisma maps `@db.Time()` columns to JS Date objects anchored on 1970-01-01.
const TIME_EPOCH = '1970-01-01';

export function timeStringToDate(time: string): Date {
  return new Date(`${TIME_EPOCH}T${time}:00.000Z`);
}

export function dateToTimeString(date: Date): string {
  return date.toISOString().slice(11, 16);
}
