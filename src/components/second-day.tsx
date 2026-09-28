import { formatDayShort } from "@/lib/time";

/**
 * "und Mi, 30. Sep., 18:00–21:00" — der 2. Kurstag unter der Uhrzeit in den
 * Terminlisten (Buchen, Verschieben durch Kundschaft und Team).
 */
export function SecondDayLine({ second }: { second: { day: string; time: string; endTime: string } | null }) {
  if (!second) return null;
  return (
    <span className="block text-fine font-semibold">
      und {formatDayShort(second.day)}, {second.time}–{second.endTime}
    </span>
  );
}
