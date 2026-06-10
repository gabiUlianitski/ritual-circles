export const CALENDAR_DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export function isoFromParts(year: number, monthIndex: number, day: number): string {
  const y = year;
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): { year: number; monthIndex: number; day: number } | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, monthIndex: m - 1, day: d };
}

export type CalendarDayCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  disabled: boolean;
  isToday: boolean;
  isSelected: boolean;
};

export function buildMonthGrid(
  viewYear: number,
  viewMonthIndex: number,
  selectedIso: string,
  minIso: string,
): CalendarDayCell[] {
  const today = todayIsoLocal();
  const first = new Date(viewYear, viewMonthIndex, 1);
  const startOffset = first.getDay();
  const gridStart = new Date(viewYear, viewMonthIndex, 1 - startOffset);
  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < 42; i += 1) {
    const dt = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const iso = isoFromParts(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const inMonth = dt.getMonth() === viewMonthIndex;
    cells.push({
      iso,
      day: dt.getDate(),
      inMonth,
      disabled: iso < minIso,
      isToday: iso === today,
      isSelected: iso === selectedIso,
    });
  }
  return cells;
}

export function monthLabel(viewYear: number, viewMonthIndex: number): string {
  return new Date(viewYear, viewMonthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function todayIsoLocal(): string {
  const d = new Date();
  return isoFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

export function defaultMeetDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return isoFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}
