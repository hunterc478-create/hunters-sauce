"use client";
/**
 * TD Derby: every NFL player's chance to score a touchdown this week, from our projection (his TD rate, the defense's
 * TDs allowed to his position, and how many points his team should score: matchup, weather, travel, injuries).
 * Filters by time slot, position and game; "Derby picks" = the top 3 of each slot. Ranked by our chance, not price.
 */
import { useMemo, useState } from "react";
import type { MatchupCardData, TdCandidate } from "@/types/sports";
import type { Leg } from "@/lib/my-bets";
import { kickoff, slotOf } from "@/lib/nfl";
import { cn } from "@/lib/utils";
import { SlipButton, TrackLegButton, usePropResults } from "./bet-list";
import { propWhyFor, setPropWhy, WhyButton } from "./why";
import type { WhyPart } from "@/types/sports";

const POS = ["RB", "WR", "TE", "QB"] as const;
const pct = (p: number) => `${Math.round(p * 100)}%`;
/** The first reason only, kept short. */
const short = (s: string) => { const f = s.split(/;\s/)[0].trim(); return f.length > 120 ? `${f.slice(0, 117).trimEnd()}…` : f; };

export const tdLeg = (t: TdCandidate): Leg => ({
  id: t.id, matchupId: t.matchupId, market: "prop", side: "over", line: 0.5, label: `${t.player} anytime TD`,
  game: `${t.team} vs ${t.opponent}`, league: "NFL", start: t.start, americanOdds: t.price?.americanOdds ?? t.fairOdds, modelProb: t.prob,
});

export function TdList({ list, start = 1 }: { list: TdCandidate[]; start?: number }) {
  const results = usePropResults();
  if (!list.length) return <p className="rounded-lg border border-dashed border-slate-line bg-slate-card p-6 text-center text-sm text-muted-foreground">No players here yet.</p>;
  return (
    <ol className="divide-y divide-slate-line overflow-hidden rounded-xl border border-slate-line bg-slate-card">
      {list.map((t, i) => {
        const res = results[t.id]?.r;
        return (
          <li key={t.id} className="flex items-start gap-3 px-3 py-3 sm:px-4">
            <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-muted-foreground">{start + i}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">
                {t.player}
                {res && <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold", res === "win" ? "bg-neon/15 text-neon" : "bg-loss/15 text-loss")}>{res === "win" ? "✓ Scored" : "✗ No TD"}</span>}
              </div>
              <div className="text-xs text-muted-foreground">{t.pos} · {t.team} vs {t.opponent} · {kickoff(t.start)}</div>
              <div className="mt-0.5 text-xs text-ink/60" title={t.note}>{short(t.note)}</div>
              <div className="flex flex-wrap gap-1">
                {new Date(t.start) > new Date() && <><TrackLegButton leg={tdLeg(t)} /><SlipButton leg={tdLeg(t)} /></>}
                <WhyButton parts={propWhyFor(t.matchupId, t.player, "anytime_td")} target={{ kind: "prop", side: "over", line: 0.5 }} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xl font-black tabular-nums text-ink">{pct(t.prob)}</div>
              <div className="text-[11px] text-muted-foreground">to score · {t.expectedTds.toFixed(2)} TDs</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter">
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-bold", value === k ? "border-ink bg-ink text-obsidian" : "border-slate-line bg-slate-card text-ink/70 hover:text-ink")}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function TdDerbyPage({ list, cards, propWhy }: { list: TdCandidate[]; cards: MatchupCardData[]; propWhy?: Record<string, WhyPart[]> }) {
  setPropWhy(propWhy);
  const [slot, setSlot] = useState("all");
  const [pos, setPos] = useState("all");
  const [game, setGame] = useState("all");
  const slots = useMemo(() => {
    // in kickoff order, so next week's Thursday game lands after this week's Monday one
    const m = new Map<string, { label: string; first: string }>();
    for (const t of list) {
      const s = slotOf(t.start), cur = m.get(s.key);
      if (!cur || t.start < cur.first) m.set(s.key, { label: s.label, first: t.start });
    }
    return [...m.entries()].sort((a, b) => a[1].first.localeCompare(b[1].first));
  }, [list]);
  const games = cards.filter((c) => list.some((t) => t.matchupId === c.matchup.id))
    .sort((a, b) => a.matchup.startTime.localeCompare(b.matchup.startTime));
  const shown = list.filter((t) => (slot === "all" || slotOf(t.start).key === slot) && (pos === "all" || t.pos === pos) && (game === "all" || t.matchupId === game));
  const picks = slots.map(([k, s]) => ({ label: s.label, top: list.filter((t) => slotOf(t.start).key === k).slice(0, 3) }));
  return (
    <>
      <header className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wider text-brand">NFL · Anytime TD</div>
        <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">TD Derby</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">Every player&apos;s chance to score this week, from our own read: his touchdown rate, how the defense handles his position, and how many points his team should put up (matchup, weather, travel, injuries). Ranked by our chance, not by price.</p>
      </header>
      {picks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 border-b-2 border-ink pb-1.5 text-lg font-black uppercase tracking-wide text-ink">Derby picks · top 3 per slot</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((p) => (
              <div key={p.label} className="rounded-xl border border-slate-line bg-slate-card p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-brand">{p.label}</div>
                <ol className="space-y-1.5 text-sm">
                  {p.top.map((t, i) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0"><span className="text-muted-foreground">{i + 1}.</span> <b>{t.player}</b> <span className="text-[11px] text-muted-foreground">{t.pos} · {t.team}</span></span>
                      <b className="shrink-0 tabular-nums">{pct(t.prob)}</b>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}
      <h2 className="mb-3 border-b-2 border-ink pb-1.5 text-lg font-black uppercase tracking-wide text-ink">Every player</h2>
      <Chips value={slot} onChange={setSlot} options={[["all", "All slots"], ...slots.map(([k, s]) => [k, s.label] as [string, string])]} />
      <Chips value={pos} onChange={setPos} options={[["all", "All positions"], ...POS.map((p) => [p, p] as [string, string])]} />
      <Chips value={game} onChange={setGame} options={[["all", "All games"], ...games.map((c) => [c.matchup.id, `${c.matchup.away.shortName} @ ${c.matchup.home.shortName}`] as [string, string])]} />
      <TdList list={shown.slice(0, 100)} />
      {shown.length > 100 && <p className="mt-2 text-xs text-muted-foreground">Showing the top 100 of {shown.length}. Filter by game or slot to see the rest.</p>}
      <p className="mt-3 text-[11px] text-muted-foreground">Our chances top out around 68%: even the best goal-line backs miss about a third of the time. Players ruled out are left off.</p>
    </>
  );
}
