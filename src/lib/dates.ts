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

export function weekdayIndex(date: Date) {
  return date.getUTCDay();
}

// ISO weekday: 1 = Monday … 7 = Sunday. Rest days are configured in this form
// because "周日休息" is more natural to write as 7 than as 0.
export function isoWeekday(date: Date) {
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay();
}

export function minutesBetween(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}
