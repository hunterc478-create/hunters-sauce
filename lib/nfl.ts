/** NFL presentation helpers: time slots, team logos, week labels. */
import type { MatchupCardData } from "@/types/sports";

const ET = "America/New_York";

/** The broadcast window a game belongs to, in Eastern time (how NFL fans think about the slate). */
export function slotOf(iso: string): { key: string; label: string; order: number } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "long" }).format(d);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hour12: false }).format(d)) % 24;
  if (day === "Thursday") return { key: "thu", label: "Thursday Night Football", order: 1 };
  if (day === "Friday") return { key: "fri", label: "Friday", order: 2 };
  if (day === "Saturday") return { key: "sat", label: "Saturday", order: 3 };
  if (day === "Sunday" && hour < 12) return { key: "sun-am", label: "Sunday Morning (International)", order: 4 };
  if (day === "Sunday" && hour < 15) return { key: "sun-early", label: "Sunday · 1:00 ET", order: 5 };
  if (day === "Sunday" && hour < 19) return { key: "sun-late", label: "Sunday · Late Afternoon", order: 6 };
  if (day === "Sunday") return { key: "snf", label: "Sunday Night Football", order: 7 };
  if (day === "Monday") return { key: "mnf", label: "Monday Night Football", order: 8 };
  return { key: day.toLowerCase(), label: day, order: 9 };
}

/** Group the week's games into broadcast slots, in order. */
export function bySlot(cards: MatchupCardData[]) {
  const map = new Map<string, { label: string; order: number; cards: MatchupCardData[] }>();
  for (const c of [...cards].sort((a, b) => a.matchup.startTime.localeCompare(b.matchup.startTime))) {
    const s = slotOf(c.matchup.startTime);
    if (!map.has(s.key)) map.set(s.key, { label: s.label, order: s.order, cards: [] });
    map.get(s.key)!.cards.push(c);
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}

/** ESPN's team logo for an abbreviation (they host every NFL logo). */
export const logo = (abbr?: string) => (abbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png` : undefined);

export function weekOf(cards: MatchupCardData[]): number | undefined {
  const weeks = cards.map((c) => c.matchup.week).filter((w): w is number => typeof w === "number");
  return weeks.length ? Math.min(...weeks) : undefined;
}

export const kickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
