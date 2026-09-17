/** Minutenbereiche innerhalb eines Tages. `end` ist ausgeschlossen. */
export type Interval = { start: number; end: number };

export function normalise(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function subtract(from: Interval[], cuts: Interval[]): Interval[] {
  let result = normalise(from);

  for (const cut of normalise(cuts)) {
    const next: Interval[] = [];
    for (const piece of result) {
      if (cut.end <= piece.start || cut.start >= piece.end) {
        next.push(piece);
        continue;
      }
      if (cut.start > piece.start) next.push({ start: piece.start, end: cut.start });
      if (cut.end < piece.end) next.push({ start: cut.end, end: piece.end });
    }
    result = next;
  }

  return result;
}
