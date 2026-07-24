function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(
  year: number,
  month: number,
  day: number,
  days: number,
): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

// Algorithme de Meeus/Jones/Butcher pour calculer la date de Pâques (calendrier grégorien).
function computeEasterDate(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

export function getFrenchPublicHolidays(
  year: number,
): { date: string; label: string }[] {
  const easter = computeEasterDate(year);

  return [
    { date: toDateString(year, 1, 1), label: 'Jour de l’An' },
    {
      date: addDays(year, easter.month, easter.day, 1),
      label: 'Lundi de Pâques',
    },
    { date: toDateString(year, 5, 1), label: 'Fête du Travail' },
    { date: toDateString(year, 5, 8), label: 'Victoire 1945' },
    {
      date: addDays(year, easter.month, easter.day, 39),
      label: 'Ascension',
    },
    {
      date: addDays(year, easter.month, easter.day, 50),
      label: 'Lundi de Pentecôte',
    },
    { date: toDateString(year, 7, 14), label: 'Fête Nationale' },
    { date: toDateString(year, 8, 15), label: 'Assomption' },
    { date: toDateString(year, 11, 1), label: 'Toussaint' },
    { date: toDateString(year, 11, 11), label: 'Armistice 1918' },
    { date: toDateString(year, 12, 25), label: 'Noël' },
  ];
}
