export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date) {
  return new Date(`${toDateKey(date)}T00:00:00.000Z`);
}

export function fromDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function nextNDays(count: number, start = new Date()) {
  const first = startOfUtcDay(start);

  return Array.from({ length: count }, (_, index) => addUtcDays(first, index));
}
