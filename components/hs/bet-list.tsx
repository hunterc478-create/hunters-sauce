"use client";
/**
 * Ranked bet lists built on OUR chance (game model: matchup, injuries, weather, travel, rest; player projections for
 * props), shown next to the books' chance. Three views:
 *   likely    our chance 55%+, odds -250 to +120, most likely first
 *   likemore  same pool, ranked by how much higher our chance is than the books'
 *   longshots +121 to +400 where our chance is 3+ points over the books'
 */
import { useState } from "react";
import type { MatchupCardData, PlayerProp, ValueBet } from "@/types/sports";
import { legFromBet, useSlip, type Leg } from "@/lib/my-bets";
import { kickoff } from "@/lib/nfl";
import { cn, fmtAmerican } from "@/lib/utils";
import { TrackButton } from "@/components/dashboard/track-button";
import { mainBet } from "./game-tile";

export interface BetRow {
  key: string;
  card: MatchupCardData;
  kind: "Spread" | "Total" | "Moneyline" | "Prop" | "Alt prop";
  label: string;
  odds: number;
  book: string;
  /** The books' chance: no-vig consensus when there is one, else the best price's implied chance. */
  books: number;
  /** Our chance, when the model has something to say. */
  our?: number;
  why?: string;
  bet?: ValueBet;
  leg: Leg;
}

export type View = "likely" | "likemore" | "longshots";
export const VIEWS: [View, string][] = [["likely", "Most likely to hit"], ["likemore", "We like more than the books"], ["longshots", "Longshots worth a look"]];

/** A model this far from the market is missing news; no number beats a misleading one. */
const sane = (our: number, books: number) => Math.abs(our - books) <= 0.25;

const whyOfGame = (c: MatchupCardData) => c.prediction.triggers
  .filter((t) => t.category !== "venue" && t.label !== "League calibration" && t.label !== "Market consensus")
  .slice(0, 3).map((t) => `${t.label}: ${t.detail}`).join(" · ");

const gameName = (c: MatchupCardData) => `${c.matchup.away.shortName} @ ${c.matchup.home.shortName}`;

/** Both sides of the main spread, total and moneyline (plus the draw) for one game. */
export function lineRows(c: MatchupCardData): BetRow[] {
  const picks: [ValueBet | undefined, BetRow["kind"]][] = [
    [mainBet(c, "spread", "away"), "Spread"], [mainBet(c, "spread", "home"), "Spread"],
    [mainBet(c, "total", "over"), "Total"], [mainBet(c, "total", "under"), "Total"],
    [mainBet(c, "moneyline", "away"), "Moneyline"], [mainBet(c, "moneyline", "home"), "Moneyline"],
  ];
  const modelGame = c.prediction.modelVersion !== "market";
  const why = whyOfGame(c);
  return picks.filter((p): p is [ValueBet, BetRow["kind"]] => !!p[0] && p[0].marketProb !== undefined).map(([b, kind]) => {
    const books = b.marketProb!;
    const our = modelGame && b.modelOnlyProb !== undefined && sane(b.modelOnlyProb, books) ? b.modelOnlyProb : undefined;
    return { key: b.id, card: c, kind, label: b.label, odds: b.bestQuote.americanOdds, book: b.bestQuote.bookmaker.name, books, our, why: why || undefined, bet: b, leg: legFromBet(b, c) };
  });
}

/** "George Kittle under 70 rec yds" for a Kalshi "70+" rung's No side; plain "Over 4.5 receptions" for book props. */
function propLabel(p: PlayerProp): string {
  if (p.source === "kalshi") {
    if (p.side === "over") return `${p.playerName} ${p.statLabel}`;
    const stat = p.statLabel.replace(/^[\d.]+\+\s*/, "");
    return p.stat === "anytime_td" ? `${p.playerName} no TD` : `${p.playerName} under ${Math.ceil(p.line)} ${stat}`;
  }
  return `${p.playerName} ${p.side === "over" ? "Over" : "Under"} ${p.line} ${p.statLabel.toLowerCase()}`;
}

export function propRows(props: PlayerProp[], cards: MatchupCardData[]): BetRow[] {
  const byId = new Map(cards.map((c) => [c.matchup.id, c]));
  return props.filter((p) => !p.flags?.includes("large_gap") && byId.has(p.matchupId)).map((p) => {
    const c = byId.get(p.matchupId)!;
    const label = propLabel(p);
    const leg: Leg = { id: p.id, matchupId: p.matchupId, market: "prop", side: p.side, line: p.line, label, game: gameName(c), league: c.matchup.league,
      start: c.matchup.startTime, americanOdds: p.bestQuote.americanOdds, modelProb: p.ourProb ?? p.modelProb };
    return { key: p.id, card: c, kind: p.isAlt || p.source === "kalshi" ? "Alt prop" as const : "Prop" as const, label,
      odds: p.bestQuote.americanOdds, book: p.bestQuote.bookmaker.name, books: p.source === "kalshi" ? p.impliedProb : p.modelProb,
      our: p.ourProb, why: p.why, leg };
  });
}

/**
 * Apply a view's filter and ranking. When chances are close, bets at the sportsbooks the user plays (FanDuel, Fliff,
 * DraftKings...) rank ahead of Kalshi rungs: a 3-point handicap on Kalshi, so it shows up but doesn't crowd the top.
 */
export function rank(rows: BetRow[], view: View): BetRow[] {
  // one row per bet: a repeated key makes React duplicate rows each time the list re-sorts (switching tabs)
  const seen = new Set<string>();
  const unique = rows.filter((r) => !seen.has(r.key) && seen.add(r.key));
  const ours = unique.filter((r): r is BetRow & { our: number } => r.our !== undefined);
  const k = (r: BetRow) => (r.book === "Kalshi" ? 0.03 : 0);
  const likeMore = (r: BetRow & { our: number }) => r.our - r.books - k(r);
  if (view === "longshots")
    return ours.filter((r) => r.odds > 120 && r.odds <= 400 && r.our >= 0.25 && r.our - r.books >= 0.03).sort((a, b) => likeMore(b) - likeMore(a));
  const pool = ours.filter((r) => r.our >= 0.55 && r.odds >= -250 && r.odds <= 120);
  return view === "likely" ? pool.sort((a, b) => (b.our - k(b)) - (a.our - k(a)))
    : pool.filter((r) => r.our > r.books).sort((a, b) => likeMore(b) - likeMore(a));
}

/** The first reason only: "244 receiving yards in 4 games this season (61.0 a game...)" -> short and scannable. */
const shortWhy = (w?: string) => {
  if (!w) return undefined;
  const first = w.split(/;\s|\.\s(?=[A-Z])|\s·\s/)[0].trim();
  return first.length > 110 ? `${first.slice(0, 107).trimEnd()}…` : first;
};

export function ViewTabs({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
      {VIEWS.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={view === k} type="button" onClick={() => onChange(k)}
          className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold", view === k ? "border-brand bg-brand text-obsidian" : "border-slate-line text-ink/70 hover:text-ink")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SlipButton({ leg }: { leg: Leg }) {
  const slip = useSlip();
  const [err, setErr] = useState<string | null>(null);
  const on = slip.has(leg.id);
  return (
    <span>
      <button type="button" aria-pressed={on} onClick={() => { if (on) { slip.remove(leg.id); setErr(null); } else setErr(slip.add(leg)); }}
        className={cn("mt-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold", on ? "border-brand bg-brand/15 text-brand" : "border-slate-line text-muted-foreground hover:text-ink")}>
        {on ? "✓ In parlay" : "+ Parlay"}
      </button>
      {err && <span role="alert" className="ml-2 text-[11px] text-warn">{err}</span>}
    </span>
  );
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function BetList({ rows, showGame = true, empty = "Nothing here yet." }: { rows: BetRow[]; showGame?: boolean; empty?: string }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed border-slate-line bg-slate-card p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="divide-y divide-slate-line overflow-hidden rounded-xl border border-slate-line bg-slate-card">
      {rows.map((r, i) => {
        const diff = r.our !== undefined ? r.our - r.books : 0;
        return (
          <li key={r.key} className="flex items-start gap-3 px-3 py-3 sm:px-4">
            <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.kind}{showGame ? ` · ${gameName(r.card)} · ${kickoff(r.card.matchup.startTime)}` : ""}</div>
              {r.why && <div className="mt-0.5 text-xs text-ink/60" title={r.why}>{shortWhy(r.why)}</div>}
              <div className="flex flex-wrap gap-1">
                {r.bet ? <TrackButton bet={r.bet} card={r.card} /> : <SlipButton leg={r.leg} />}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {r.our !== undefined && <div className="text-xl font-black tabular-nums text-ink">{pct(r.our)}</div>}
              <div className="text-[11px] tabular-nums text-muted-foreground">
                {r.our !== undefined ? "our chance · " : ""}books {pct(r.books)}
                {r.our !== undefined && Math.abs(diff) >= 0.01 && <b className={diff > 0 ? " text-neon" : " text-loss"}> {diff > 0 ? "+" : ""}{Math.round(diff * 100)}</b>}
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums">{fmtAmerican(r.odds)} <span className="text-[11px] font-normal text-muted-foreground">{r.book}</span></div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

