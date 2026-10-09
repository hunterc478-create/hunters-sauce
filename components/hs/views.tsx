"use client";
/** Hunter's Sportsbook pages: This Week, a page per game, Best Bets, Props, Teasers. */
import { useState } from "react";
import Link from "next/link";
import type { MatchupCardData, PlayerProp, TeaserLeg } from "@/types/sports";
import type { LiveBundle } from "@/lib/live/assemble";
import { bySlot, kickoff, weekOf } from "@/lib/nfl";
import { cn, fmtPct } from "@/lib/utils";
import { LocksTable } from "@/components/dashboard/locks-table";
import { TdDerby } from "@/components/dashboard/td-derby";
import { GameRow } from "@/components/board/game-row";
import { GameTile, TEASER_BREAKEVEN, TEASER_LEG_MIN, TeamLogo } from "./game-tile";
import { LoadPropsButton } from "./load-props";
import { BetList, lineRows, propRows, rank, usePropResults, ViewTabs, type BetRow, type View } from "./bet-list";
import { ModelCheck } from "@/components/dashboard/model-check";
import { fmtAmerican, fmtUnits } from "@/lib/utils";
import { ParlayIdeas } from "./parlay-ideas";
import { alpha, colorOf } from "@/lib/team-colors";
import { useLeague, type Lg } from "./league";

/** Games still to be played in the selected league (lists, rankings and parlays use only these). */
const open = (cards: MatchupCardData[], lg: Lg = "NFL") => cards.filter((c) => c.matchup.status === "scheduled" && c.matchup.league === lg);
/** Every game this week in the league, started ones included (they stay up with their scores until the week ends). */
const week = (cards: MatchupCardData[], lg: Lg = "NFL") => cards.filter((c) => c.matchup.league === lg);
const lgName = (lg: Lg) => (lg === "NFL" ? "NFL" : "College football");
/** Shown on NFL-only pages (props, teasers, our picks) when College is selected. */
const NflOnly = ({ what }: { what: string }) => <p className="mb-6 rounded-lg border border-brand/40 bg-brand/10 p-3 text-sm">{what} are NFL only, so this page shows NFL.</p>;

/** Every game line and prop on open games (ranking happens per view). */
const allRows = (cards: MatchupCardData[], props: PlayerProp[], lg: Lg = "NFL"): BetRow[] => {
  const games = open(cards, lg);
  return [...games.flatMap(lineRows), ...propRows(props, games)];
};
const isProp = (r: BetRow) => r.kind === "Prop" || r.kind === "Alt prop";

function Title({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <header className="mb-6">
      {kicker && <div className="text-xs font-bold uppercase tracking-wider text-brand">{kicker}</div>}
      <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">{title}</h1>
      {sub && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{sub}</p>}
    </header>
  );
}

function Section({ title, href, link, children }: { title: string; href?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
        <h2 className="text-lg font-black uppercase tracking-wide text-ink">{title}</h2>
        {href && <Link href={href} className="text-sm font-bold text-brand hover:underline">{link} →</Link>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-lg border border-dashed border-slate-line bg-slate-card p-6 text-center text-sm text-muted-foreground">{text}</p>;

/** Filter chips (bet type, game). */
function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter">
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-bold", value === k ? "border-ink bg-ink text-obsidian" : "border-slate-line bg-slate-card text-ink/70 hover:text-ink")}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------- This Week ----------------

export function WeekView({ bundle }: { bundle: LiveBundle }) {
  const data = bundle.byDay.all;
  const { league } = useLeague();
  const games = open(data.matchups, league);
  const all = week(data.matchups, league);
  const weekNo = weekOf(all);
  const rows = allRows(data.matchups, data.props, league);
  const legs = games.flatMap((c) => c.teasers ?? []).filter((t) => t.prob >= TEASER_LEG_MIN);
  const tiles = [
    { k: "Likely to hit", v: rank(rows, "likely").length, href: "/best-bets/" },
    { k: "We like more", v: rank(rows, "likemore").length, href: "/best-bets/" },
    { k: "Longshots", v: rank(rows, "longshots").length, href: "/best-bets/" },
    { k: "Teaser legs", v: legs.length, href: "/teasers/" },
  ];
  return (
    <>
      <Title kicker={lgName(league)} title={weekNo ? `Week ${weekNo}` : "This week"} sub="Our read on every game: matchups, injuries, weather, travel and rest. Tap a game for its full list." />
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.k} href={t.href} className="rounded-xl border border-slate-line bg-slate-card p-4 hover:bg-slate-raised">
            <div className="text-3xl font-black tabular-nums text-ink">{t.v}</div>
            <div className="text-sm font-semibold text-muted-foreground">{t.k}</div>
          </Link>
        ))}
      </div>
      {rows.length > 0 && (
        <Section title="Most likely to hit" href="/best-bets/" link="Top 25">
          <BetList rows={rank(rows, "likely").slice(0, 5)} />
        </Section>
      )}
      {rows.length > 0 && (
        <Section title="Parlay ideas" href="/parlays/" link="More parlays">
          <ParlayIdeas rows={rows} seed={bundle.generatedAt + league} count={2} />
        </Section>
      )}
      {!all.length && <Empty text={`No ${lgName(league)} games on the board yet. Lines for next week usually post Sunday night.`} />}
      {bySlot(all).map((s) => (
        <Section key={s.label} title={s.label}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{s.cards.map((c) => <GameTile key={c.matchup.id} card={c} />)}</div>
        </Section>
      ))}
    </>
  );
}

// ---------------- Game page ----------------

export function GameView({ bundle, id }: { bundle: LiveBundle; id: string }) {
  const data = bundle.byDay.all;
  const [view, setView] = useState<View>("likely");
  const propResults = usePropResults();
  const card = data.matchups.find((c) => c.matchup.id === id);
  if (!card) return <><Title title="Game not found" /><Empty text="This game isn't on the board anymore (it may have finished). Head back to This Week." /></>;
  const m = card.matchup;
  const rows = [...lineRows(card), ...propRows(data.props.filter((p) => p.matchupId === id), [card])];
  const shown = rank(rows, view);
  const hasProps = rows.some((r) => r.kind === "Prop");
  const td = (data.tdDerby ?? []).filter((t) => t.matchupId === id);
  const lean = card.prediction.modelVersion !== "market" ? card.prediction : null;
  const injuries = (["away", "home"] as const).map((s) => ({ team: m[s], list: card.factors[s].injuries.filter((i) => i.status !== "probable") }));
  const w = card.factors.weather;
  return (
    <>
      <Link href="/" className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← This week ({m.league === "NFL" ? "NFL" : "College"})</Link>
      <header className="relative mb-8 overflow-hidden rounded-xl border border-slate-line p-5"
        style={{ background: `linear-gradient(120deg, ${alpha(colorOf(m.away, m.league), 0.35)} 0%, #17191E 42%, #17191E 58%, ${alpha(colorOf(m.home, m.league), 0.35)} 100%)` }}>
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${colorOf(m.away, m.league)} 0 50%, ${colorOf(m.home, m.league)} 50% 100%)` }} />
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand">
          <span>{m.week ? `Week ${m.week} · ` : ""}{kickoff(m.startTime)}</span>
          {m.status !== "scheduled" && <span className={cn("rounded px-1.5 py-0.5", m.status === "live" ? "bg-loss text-obsidian" : "bg-ink text-obsidian")}>{m.status === "live" ? "Live" : "Final"}{m.score ? ` · ${m.away.shortName} ${m.score.away}, ${m.home.shortName} ${m.score.home}` : ""}</span>}
        </div>
        <div className="flex items-center justify-between gap-4">
          {(["away", "home"] as const).map((s, i) => (
            <div key={s} className={cn("flex min-w-0 flex-1 items-center gap-3", i === 1 && "flex-row-reverse text-right")}>
              <TeamLogo team={m[s]} size={40} league={m.league} />
              <div className="min-w-0">
                <div className="break-words text-base font-black leading-tight text-ink sm:text-2xl">{m[s].shortName}</div>
                <div className="text-xs text-muted-foreground">{m[s].record ?? ""}{s === "home" ? " · home" : ""}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-line pt-3 text-sm text-muted-foreground">
          {m.venue && <span>{m.venue.name}{m.venue.city ? `, ${m.venue.city}` : ""}</span>}
          <span>{m.venue?.indoor ? "Indoors" : w ? `${Math.round(w.temperatureF)}°F · wind ${Math.round(w.windMph)} mph · ${Math.round(w.precipitationChance * 100)}% rain` : "Weather not in yet"}</span>
          {lean && <span>Our stats model: {m.home.shortName} {fmtPct(lean.homeWinProb, 0)} to win, {lean.projectedTotal.toFixed(1)} total points</span>}
        </div>
      </header>

      <Section title="Our best bets for this game">
        <ViewTabs view={view} onChange={setView} />
        <BetList rows={shown} showGame={false} results={propResults} empty={view === "longshots" ? "No longshot we like more than the books for this game." : "Nothing our model rates 55%+ at a playable price yet."} />
        {!hasProps && <p className="mt-2 text-sm text-muted-foreground">Props for this game load at 9 AM Central the day before or the day of kickoff.</p>}
        <LoadPropsButton compact />
      </Section>

      <Section title="Every book's price">
        <GameRow card={card} defaultOpen />
      </Section>

      {m.league === "NFL" && (
        <Section title="Teaser legs (6 points)">
          <TeaserTable legs={card.teasers ?? []} cards={[card]} />
        </Section>
      )}

      {td.length > 0 && (
        <Section title="Anytime TD chances">
          <TdDerby list={td} modelOnly />
        </Section>
      )}

      <Section title="Injuries">
        <div className="grid gap-4 sm:grid-cols-2">
          {injuries.map(({ team, list }) => (
            <div key={team.id} className="rounded-lg border border-slate-line bg-slate-card p-4">
              <div className="mb-2 font-bold">{team.shortName}</div>
              {list.length ? (
                <ul className="space-y-1 text-sm">{list.map((i) => <li key={i.playerId + i.playerName} className="flex justify-between gap-2"><span>{i.playerName} <span className="text-muted-foreground">{i.position}</span></span><span className="capitalize text-muted-foreground">{i.status.replace("_", "-")}</span></li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">No notable injuries listed.</p>}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ---------------- Best Bets ----------------

export function BestBetsView({ bundle }: { bundle: LiveBundle }) {
  const data = bundle.byDay.all;
  const { league } = useLeague();
  const rows = allRows(data.matchups, data.props, league);
  const [view, setView] = useState<View>("likely");
  const [kind, setKind] = useState<"all" | BetRow["kind"]>("all");
  const shown = rank(rows, view).filter((r) => kind === "all" || r.kind === kind).slice(0, 25);
  return (
    <>
      <Title kicker={`Best bets · ${lgName(league)}`} title="Top 25 this week" sub="Ranked by our chance: matchups, injuries, weather, travel and rest for games; player projections for props." />
      <ViewTabs view={view} onChange={setView} />
      <Chips value={kind} onChange={setKind} options={[["all", "All"], ["Spread", "Spreads"], ["Total", "Totals"], ["Moneyline", "Moneylines"], ["Prop", "Props"], ["Alt prop", "Alt props"]]} />
      <BetList rows={shown} empty="Nothing matches yet; more fills in as props load." />
      {(data.locks?.length ?? 0) > 0 && <div className="mt-10"><Section title="Locks" href="/locks/" link="All locks"><LocksTable locks={data.locks!.slice(0, 5)} matchups={data.matchups} /></Section></div>}
    </>
  );
}

// ---------------- Props ----------------


export function PropsView({ bundle }: { bundle: LiveBundle }) {
  const data = bundle.byDay.all;
  const { league } = useLeague();
  const games = open(data.matchups);
  const all = propRows(data.props, games);
  const loaded = games.filter((c) => all.some((r) => r.card.matchup.id === c.matchup.id));
  const [game, setGame] = useState("all");
  const [view, setView] = useState<View>("likely");
  const shown = rank(all.filter((r) => game === "all" || r.card.matchup.id === game), view);
  return (
    <>
      {league !== "NFL" && <NflOnly what="Player props" />}
      <Title kicker="Player props" title="Props & alt props" sub="From FanDuel, Fliff, DraftKings and more, plus alt ladders. Ranked by our player projections." />
      <LoadPropsButton />
      {loaded.length > 0 && (
        <Chips value={game} onChange={setGame}
          options={[["all", `All games (${all.length})`], ...loaded.map((c) => [c.matchup.id, `${c.matchup.away.shortName} @ ${c.matchup.home.shortName}`] as [string, string])]} />
      )}
      <ViewTabs view={view} onChange={setView} />
      <BetList rows={shown} empty={`No props loaded yet: they load at 9 AM Central for games in the next 36 hours (${loaded.length} of ${games.length} games so far).`} />
      {(data.tdDerby?.length ?? 0) > 0 && (
        <div className="mt-10">
          <Section title="Anytime TD chances">
            <TdDerby list={data.tdDerby!.slice(0, 30)} modelOnly />
          </Section>
        </div>
      )}
    </>
  );
}

// ---------------- Teasers ----------------

function TeaserTable({ legs, cards }: { legs: TeaserLeg[]; cards: MatchupCardData[] }) {
  if (!legs.length) return <Empty text="No teaser numbers for this game yet." />;
  const gameOf = (l: TeaserLeg) => cards.find((c) => c.matchup.home.shortName === l.team || c.matchup.away.shortName === l.team)?.matchup;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-line bg-slate-card">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="border-b border-slate-line bg-slate-raised text-left text-xs text-muted-foreground">
          <th className="px-3 py-2 font-semibold">Team</th><th className="px-3 py-2 font-semibold">Spread → teased</th>
          <th className="px-3 py-2 text-right font-semibold">Covers since 2010</th><th className="px-3 py-2 font-semibold" />
        </tr></thead>
        <tbody>
          {legs.map((l) => {
            const g = gameOf(l);
            return (
              <tr key={`${l.team}${l.line}`} className="border-b border-slate-line last:border-0">
                <td className="px-3 py-2.5"><b>{l.team}</b>{g && cards.length > 1 && <div className="text-xs text-muted-foreground">{g.away.shortName} @ {g.home.shortName} · {kickoff(g.startTime)}</div>}</td>
                <td className="px-3 py-2.5 tabular-nums">{fmtSpread(l.line)} → <b>{fmtSpread(l.teased)}</b></td>
                <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", l.prob >= TEASER3_BREAKEVEN ? "text-neon" : "text-muted-foreground")}>{fmtPct(l.prob, 1)}</td>
                <td className="space-x-1 px-3 py-2.5 whitespace-nowrap">
                  {l.prob >= TEASER_BREAKEVEN ? <span className="rounded bg-neon/10 px-1.5 py-0.5 text-xs font-bold text-neon">2- or 3-team</span>
                    : l.prob >= TEASER3_BREAKEVEN ? <span className="rounded bg-neon/10 px-1.5 py-0.5 text-xs font-bold text-neon">3-team</span> : null}
                  {l.wong && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-bold text-brand">Crosses 3 &amp; 7</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const fmtSpread = (x: number) => (x === 0 ? "PK" : x > 0 ? `+${x}` : `${x}`);
/** 3-team, 6-point teaser at +160: (1 / 2.6) ^ (1/3) per leg. */
const TEASER3_BREAKEVEN = 0.727;

export function TeasersView({ bundle }: { bundle: LiveBundle }) {
  const { league } = useLeague();
  const games = open(bundle.byDay.all.matchups);
  const legs = games.flatMap((c) => c.teasers ?? []).sort((a, b) => b.prob - a.prob);
  const gameId = (l: TeaserLeg) => games.find((c) => c.matchup.home.shortName === l.team || c.matchup.away.shortName === l.team)?.matchup.id;
  /** The n strongest legs at or above `min`, one per game (two sides of one game can't both be the edge). */
  const strongest = (n: number, min: number) => {
    const out: TeaserLeg[] = [];
    for (const l of legs) if (l.prob >= min && !out.some((o) => gameId(o) === gameId(l))) { out.push(l); if (out.length === n) break; }
    return out.length === n ? out : [];
  };
  const good = legs.filter((l) => l.prob >= TEASER_BREAKEVEN);
  const good3 = legs.filter((l) => l.prob >= TEASER3_BREAKEVEN);
  const combos = [
    { title: "Strongest 2-team teaser", legs: strongest(2, TEASER_BREAKEVEN), payout: 1 + 100 / 120, price: "-120" },
    { title: "Strongest 3-team teaser", legs: strongest(3, TEASER3_BREAKEVEN), payout: 2.6, price: "+160" },
  ].filter((c) => c.legs.length);
  return (
    <>
      {league !== "NFL" && <NflOnly what="Teasers (built on NFL results since 2010)" />}
      <Title kicker="Teasers" title="6-point teaser finder" sub="A teaser moves every spread 6 points your way for a worse price. NFL games land on 3 and 7 so often that legs crossing both numbers have historically been one of the few sound bets. Each number below is how often similar games actually covered the teased line since 2010." />
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-line bg-slate-card p-4"><div className="text-xs text-muted-foreground">2-team at -120 needs</div><div className="text-2xl font-black">73.9%</div><div className="text-xs text-muted-foreground">per leg to break even</div></div>
        <div className="rounded-lg border border-slate-line bg-slate-card p-4"><div className="text-xs text-muted-foreground">3-team at +160 needs</div><div className="text-2xl font-black">72.7%</div><div className="text-xs text-muted-foreground">per leg to break even</div></div>
        <div className="rounded-lg border border-slate-line bg-slate-card p-4"><div className="text-xs text-muted-foreground">Legs this week clearing</div><div className="text-2xl font-black text-neon">{good.length} · {good3.length}</div><div className="text-xs text-muted-foreground">the 2-team · 3-team bar, of {legs.length}</div></div>
      </div>
      {combos.map((c) => {
        const p = c.legs.reduce((x, l) => x * l.prob, 1);
        const ev = p * c.payout - 1;
        return (
          <Section key={c.title} title={c.title}>
            <div className="rounded-lg border-2 border-brand bg-slate-card p-4">
              <div className="text-lg font-black">{c.legs.map((l) => `${l.team} ${fmtSpread(l.teased)}`).join("  +  ")}</div>
              <div className="mt-1 text-sm text-muted-foreground">All legs covered together {fmtPct(p, 1)} of the time historically. At {c.price} that&apos;s <b className={ev >= 0 ? "text-neon" : "text-loss"}>{ev >= 0 ? "+" : ""}{(ev * 100).toFixed(1)}% EV</b> per bet. Legs are treated as independent games.</div>
            </div>
          </Section>
        );
      })}
      {!combos.length && <p className="mb-8 text-sm text-muted-foreground">No combination clears the break-even bar this week. That happens; skipping is the right call.</p>}
      <Section title="Every leg this week">
        <TeaserTable legs={legs} cards={games} />
      </Section>
      <p className="text-xs text-muted-foreground">Past results, not a guarantee. Books know about teasers too: some price them at -130 or worse, which raises the bar to about 75% per leg, so check your book&apos;s teaser price.</p>
    </>
  );
}

// ---------------- Parlays ----------------

export function ParlaysPage({ bundle }: { bundle: LiveBundle }) {
  const data = bundle.byDay.all;
  const { league } = useLeague();
  const [mode, setMode] = useState<"mixed" | "ml">("mixed");
  const rows = allRows(data.matchups, data.props, league);
  const mlRows = [...allRows(data.matchups, data.props, "NFL"), ...allRows(data.matchups, data.props, "NCAAF")].filter((r) => r.kind === "Moneyline");
  return (
    <>
      <Title kicker="Parlays" title="Parlay ideas" sub="A fresh set every update from legs our model likes. Shuffle for more, or tap Add to slip to edit one." />
      <Chips value={mode} onChange={setMode} options={[["mixed", `Mixed · ${lgName(league)}`], ["ml", "Moneylines only · NFL + College"]]} />
      {mode === "mixed"
        ? <ParlayIdeas rows={rows} seed={bundle.generatedAt + league} count={10} />
        : <ParlayIdeas rows={mlRows} seed={bundle.generatedAt + "ml"} count={10} mode="ml" />}
    </>
  );
}

// ---------------- Our Picks ----------------

/** Our own record: the top "most likely to hit" bets, logged automatically before each kickoff window. */
export function OurPicksPage({ bundle }: { bundle: LiveBundle }) {
  const data = bundle.byDay.all;
  const rec = data.oursRecord;
  const picks = data.oursPicks ?? [];
  const { league } = useLeague();
  const decided = rec ? rec.wins + rec.losses : 0;
  const avgOur = picks.filter((p) => p.result === "win" || p.result === "loss").reduce((s, p, _, a) => s + p.modelProb / a.length, 0);
  const tiles = [
    { k: "Record", v: rec ? `${rec.wins}-${rec.losses}${rec.pushes ? `-${rec.pushes}` : ""}` : "0-0" },
    { k: "Hit rate", v: decided ? `${Math.round((rec!.wins / decided) * 100)}%` : "—", sub: decided ? `we predicted ${Math.round(avgOur * 100)}%` : "" },
    { k: "Units", v: rec ? fmtUnits(rec.unitsProfit) : "+0.00u", tone: rec && rec.unitsProfit < 0 ? "text-loss" : "text-neon" },
    { k: "ROI", v: rec && rec.picks ? `${(rec.roi * 100).toFixed(1)}%` : "—" },
  ];
  const byDay = new Map<string, typeof picks>();
  for (const p of picks) { const d = new Date(p.placedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); byDay.set(d, [...(byDay.get(d) ?? []), p]); }
  return (
    <>
      {league !== "NFL" && <NflOnly what="Our Picks" />}
      <Title kicker="Our picks" title="Our record" sub="About 2 hours before each game, the site logs that game's top 5 most-likely-to-hit bets, 1 unit each at the best price, and grades them automatically. Separate from your bets." />
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-xl border border-slate-line bg-slate-card p-4">
            <div className={cn("text-3xl font-black tabular-nums", t.tone)}>{t.v}</div>
            <div className="text-sm font-semibold text-muted-foreground">{t.k}</div>
            {t.sub && <div className="text-[11px] text-muted-foreground">{t.sub}</div>}
          </div>
        ))}
      </div>
      {data.oursCheck && data.oursCheck.picks > 0 && <div className="mb-10"><ModelCheck check={data.oursCheck} /></div>}
      {!picks.length && <Empty text="No picks logged yet. The first ones log about 2 hours before the next kickoff." />}
      {[...byDay.entries()].map(([day, list]) => (
        <Section key={day} title={day}>
          <ol className="divide-y divide-slate-line overflow-hidden rounded-xl border border-slate-line bg-slate-card">
            {list.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-foreground">our chance {Math.round(p.modelProb * 100)}% · {fmtAmerican(p.americanOdds)}</div>
                </div>
                <span className={cn("shrink-0 rounded px-2 py-0.5 text-xs font-bold", p.result === "win" ? "bg-neon/15 text-neon" : p.result === "loss" ? "bg-loss/15 text-loss" : "bg-slate-raised text-ink/70")}>
                  {p.result === "win" ? `✓ +${(p.profitUnits ?? 0).toFixed(2)}u` : p.result === "loss" ? "✗ -1u" : p.result === "pending" ? "Pending" : p.result}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ))}
      <p className="text-xs text-muted-foreground">The value-bet log (books paying more than the consensus) is on the <Link href="/tracker/" className="font-semibold text-brand hover:underline">Record</Link> page.</p>
    </>
  );
}
