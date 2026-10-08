"use client";
/**
 * Ranked bet list: every game line and every sportsbook prop as one row, best EV first, with a plain tag.
 * Shows everything (not just "value") so there's plenty to research; the tag says how the price compares to fair.
 */
import type { MatchupCardData, PlayerProp, ValueBet } from "@/types/sports";
import { toDecimal } from "@/lib/odds-math";
import { kickoff } from "@/lib/nfl";
import { cn, fmtAmerican } from "@/lib/utils";
import { TrackButton } from "@/components/dashboard/track-button";
import { mainBet } from "./game-tile";

export interface BetRow {
  key: string;
  card: MatchupCardData;
  kind: "Spread" | "Total" | "Moneyline" | "Prop";
  label: string;
  odds: number;
  book: string;
  /** Fair chance from the books' consensus. */
  fair: number;
  /** Average return per bet at the best price. */
  ev: number;
  bet?: ValueBet;
}

/** Value: beats fair by 1%+. Close to fair: a normal price (a -110/-110 line is about -2.5%). Below fair: overpaying. */
export function tagOf(ev: number) {
  return ev >= 0.01 ? { text: "Value", cls: "bg-neon/10 text-neon" }
    : ev >= -0.03 ? { text: "Close to fair", cls: "bg-slate-raised text-ink/70" }
    : { text: "Below fair", cls: "bg-loss/10 text-loss" };
}

/** Both sides of the main spread, total and moneyline (plus the draw if any) for one game. */
export function lineRows(c: MatchupCardData): BetRow[] {
  const picks: [ValueBet | undefined, BetRow["kind"]][] = [
    [mainBet(c, "spread", "away"), "Spread"], [mainBet(c, "spread", "home"), "Spread"],
    [mainBet(c, "total", "over"), "Total"], [mainBet(c, "total", "under"), "Total"],
    [mainBet(c, "moneyline", "away"), "Moneyline"], [mainBet(c, "moneyline", "home"), "Moneyline"],
    [[c.recommended, ...c.otherBets].find((b) => b.market === "moneyline" && b.side === "draw"), "Moneyline"],
  ];
  return picks.filter((p): p is [ValueBet, BetRow["kind"]] => !!p[0] && p[0].marketProb !== undefined).map(([b, kind]) => ({
    key: b.id, card: c, kind, label: b.label, odds: b.bestQuote.americanOdds, book: b.bestQuote.bookmaker.name,
    fair: b.marketProb!, ev: b.expectedValue, bet: b,
  }));
}

/** Sportsbook props (priced from the books' consensus); Kalshi's model-priced props are left out. */
export function propRows(props: PlayerProp[], cards: MatchupCardData[]): BetRow[] {
  const byId = new Map(cards.map((c) => [c.matchup.id, c]));
  return props.filter((p) => p.source !== "kalshi" && !p.flags?.includes("large_gap") && byId.has(p.matchupId)).map((p) => ({
    key: p.id, card: byId.get(p.matchupId)!, kind: "Prop" as const,
    label: `${p.playerName} ${p.side === "over" ? "Over" : "Under"} ${p.line} ${p.statLabel.toLowerCase()}`,
    odds: p.bestQuote.americanOdds, book: p.bestQuote.bookmaker.name, fair: p.modelProb,
    ev: p.modelProb * toDecimal(p.bestQuote.americanOdds) - 1,
  }));
}

export const byEv = (rows: BetRow[]) => [...rows].sort((a, b) => b.ev - a.ev);

export function BetList({ rows, showGame = true, empty = "No bets to show yet." }: { rows: BetRow[]; showGame?: boolean; empty?: string }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed border-slate-line bg-white p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="divide-y divide-slate-line overflow-hidden rounded-lg border border-slate-line bg-white">
      {rows.map((r, i) => {
        const tag = tagOf(r.ev);
        const m = r.card.matchup;
        return (
          <li key={r.key} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
            <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{r.label}</div>
              <div className="text-xs text-muted-foreground">
                {r.kind}{showGame ? ` · ${m.away.shortName} @ ${m.home.shortName} · ${kickoff(m.startTime)}` : ""}
              </div>
              {r.bet && <TrackButton bet={r.bet} card={r.card} />}
            </div>
            <div className="shrink-0 text-right">
              <div className="font-bold tabular-nums">{fmtAmerican(r.odds)} <span className="text-xs font-normal text-muted-foreground">{r.book}</span></div>
              <div className="text-xs tabular-nums text-muted-foreground">fair {Math.round(r.fair * 100)}% · <b className={r.ev >= 0 ? "text-neon" : "text-loss"}>EV {r.ev >= 0 ? "+" : ""}{(r.ev * 100).toFixed(1)}%</b></div>
              <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold", tag.cls)}>{tag.text}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
