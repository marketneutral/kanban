/**
 * IC meetings happen every Monday. Dates are stored as UTC midnight of the
 * meeting Monday.
 */

/** Stages whose gate includes a team presentation. */
export const PRESENTATION_STAGES = ["ONE_PAGER", "FIVE_PAGER", "PROPOSAL"] as const;

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The next `count` IC Mondays, including today when today is a Monday. */
export function nextMondays(count: number): Date[] {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(d);
    m.setUTCDate(d.getUTCDate() + i * 7);
    return m;
  });
}

export function isMonday(d: Date): boolean {
  return d.getUTCDay() === 1;
}

export function meetingKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtMeeting(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
