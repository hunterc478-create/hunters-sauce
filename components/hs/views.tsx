"use client";
/** Hunter's Sportsbook pages: This Week, a page per game, Best Bets, Props, Teasers. */
import Link from "next/link";
import type { MatchupCardData, PlayerProp, TeaserLeg, ValueBet } from "@/types/sports";
import type { LiveBundle } from "@/lib/live/assemble";
import { isValueBet } from "@/lib/live/policy";
import { toDecimal } from "@/lib/odds-math";
import { bySlot, kickoff, weekOf } from "@/lib/nfl";
import { cn, fmtAmerican, fmtPct } from "@/lib/utils";
import { EvPicksTable } from "@/components/dashboard/ev-picks-table";
import { LocksTable } from "@/components/dashboard/locks-table";
import { TdDerby } from "@/components/dashboard/td-derby";
import { GameRow } from "@/components/board/game-row";
import { GameTile, TEASER_BREAKEVEN, TEASER_LEG_MIN, TeamLogo } from "./game-tile";
import { LoadPropsButton } from "./load-props";

const open = (cards: MatchupCardData[]) => cards.filter((c) => c.matchup.status !== "final" && c.matchup.league === "NFL");
const valueBets = (cards: MatchupCardData[]) => open(cards).flatMap((c) => [c.recommended, ...c.otherBets].filter((b) => isValueBet(b, "NFL")))
  .sort((a, b) => b.expectedValue - a.expectedValue);

/** Props worth showing: sportsbook props (consensus-priced) a book pays 2+ points over fair on. */
const PROP_MIN_EDGE = 0.02;
const propEv = (p: PlayerProp) => p.modelProb * toDecimal(p.bestQuote.americanOdds) - 1;
const bookProps = (props: PlayerProp[]) => props.filter((p) => p.source !== "kalshi" && !p.flags?.includes("large_gap"));

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

const Empty = ({ text }: { text: string }) => <p className="rounded-lg border border-dashed border-slate-line bg-white p-6 text-center text-sm text-muted-foreground">{text}</p>;

// ---------------- This Week ----------------

export function WeekView({ bundle }: { bundle: LiveBundle }) {
  const data = bundle.byDay.all;
  const games = open(data.matchups);
  const week = weekOf(games);
  const vb = valueBets(data.matchups);
  const legs = games.flatMap((c) => c.teasers ?? []).filter((t) => t.prob >= TEASER_LEG_MIN);
  const props = bookProps(data.props).filter((p) => p.edge >= PROP_MIN_EDGE);
  const tiles = [
    { k: "Value bets", v: vb.length, href: "/best-bets/" },
    { k: "Prop edges", v: props.length, href: "/props/" },
    { k: "Teaser legs", v: legs.length, href: "/teasers/" },
    { k: "Locks", v: data.locks?.length ?? 0, href: "/locks/" },
  ];
  return (
    <>
      <Title kicker="NFL" title={week ? `Week ${week}` : "This week"} sub="Every game's best price across the sportsbooks, checked against the fair price from all of them together. Tap a game for its full page." />
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.k} href={t.href} className="rounded-lg border border-slate-line bg-white p-4 shadow-card hover:shadow-md">
            <div className="text-3xl font-black tabular-nums text-ink">{t.v}</div>
            <div className="text-sm font-semibold text-muted-foreground">{t.k}</div>
          </Link>
        ))}
      </div>
      {vb.length > 0 && (
        <Section title="Best bets right now" href="/best-bets/" link="All best bets">
          <EvPicksTable picks={vb} matchups={data.matchups} limit={3} title="Top value" />
        </Section>
      )}
      {!games.length && <Empty text="No NFL games on the board yet. Lines for next week usually post Sunday night." />}
      {bySlot(games).map((s) => (
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
  const card = data.matchups.find((c) => c.matchup.id === id);
  if (!card) return <><Title title="Game not found" /><Empty text="This game isn't on the board anymore (it may have finished). Head back to This Week." /></>;
  const m = card.matchup;
  const props = bookProps(data.props.filter((p) => p.matchupId === id)).sort((a, b) => b.edge - a.edge);
  const td = (data.tdDerby ?? []).filter((t) => t.matchupId === id);
  const lean = card.prediction.modelVersion !== "market" ? card.prediction : null;
  const injuries = (["away", "home"] as const).map((s) => ({ team: m[s], list: card.factors[s].injuries.filter((i) => i.status !== "probable") }));
  const w = card.factors.weather;
  return (
    <>
      <Link href="/" className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← This week</Link>
      <header className="mb-8 rounded-lg border border-slate-line bg-white p-5 shadow-card">
        <div className="mb-4 text-xs font-bold uppercase tracking-wider text-brand">{m.week ? `Week ${m.week} · ` : ""}{kickoff(m.startTime)}</div>
        <div className="flex items-center justify-between gap-4">
          {(["away", "home"] as const).map((s, i) => (
            <div key={s} className={cn("flex min-w-0 flex-1 items-center gap-3", i === 1 && "flex-row-reverse text-right")}>
              <TeamLogo team={m[s]} size={56} />
              <div className="min-w-0">
                <div className="truncate text-xl font-black text-ink sm:text-2xl">{m[s].shortName}</div>
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

      <Section title="Lines & best prices">
        <GameRow card={card} defaultOpen />
      </Section>

      <Section title="Teaser legs (6 points)">
        <TeaserTable legs={card.teasers ?? []} cards={[card]} />
      </Section>

      <Section title="Player props">
        {props.length ? <PropsTable props={props} cards={[card]} />
          : <Empty text="Sportsbook props for this game load at 9 AM Central the day before or the day of kickoff." />}
        <LoadPropsButton compact />
      </Section>

      {td.length > 0 && (
        <Section title="Anytime TD (our model)">
          <p className="mb-3 text-xs text-muted-foreground">These chances come from our own player model, not the sportsbooks, so treat them as a guide: only bet one when a book pays more than the fair price shown.</p>
          <TdDerby list={td} modelOnly />
        </Section>
      )}

      <Section title="Injuries">
        <div className="grid gap-4 sm:grid-cols-2">
          {injuries.map(({ team, list }) => (
            <div key={team.id} className="rounded-lg border border-slate-line bg-white p-4">
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
  const vb = valueBets(data.matchups);
  return (
    <>
      <Title kicker="Best bets" title="Where a book is paying too much" sub="A book's price beats the fair price from the consensus of every sportsbook we track, by at least a point. EV is the average return per bet. Real edges are small and rare, so expect a handful a week." />
      {vb.length ? <EvPicksTable picks={vb} matchups={data.matchups} title={`${vb.length} value ${vb.length === 1 ? "bet" : "bets"}`} />
        : <Empty text="No book is beating the consensus by enough right now. Value shows up as lines move during the week; check back." />}
      {(data.locks?.length ?? 0) > 0 && <div className="mt-10"><Section title="Locks" href="/locks/" link="All locks"><LocksTable locks={data.locks!.slice(0, 5)} matchups={data.matchups} /></Section></div>}
    </>
  );
}

// ---------------- Props ----------------

export function PropsTable({ props, cards }: { props: PlayerProp[]; cards: MatchupCardData[] }) {
  const game = new Map(cards.map((c) => [c.matchup.id, c.matchup]));
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-line bg-white">
      <table className="w-full min-w-[600px] text-sm">
        <thead><tr className="border-b border-slate-line bg-slate-raised text-left text-xs text-muted-foreground">
          <th className="px-3 py-2 font-semibold">Player</th><th className="px-3 py-2 font-semibold">Bet</th>
          <th className="px-3 py-2 text-right font-semibold">Best price</th><th className="px-3 py-2 text-right font-semibold">Fair</th><th className="px-3 py-2 text-right font-semibold">EV</th>
        </tr></thead>
        <tbody>
          {props.map((p) => {
            const g = game.get(p.matchupId);
            const ev = propEv(p);
            return (
              <tr key={p.id} className="border-b border-slate-line last:border-0">
                <td className="px-3 py-2.5"><div className="font-semibold">{p.playerName}</div>{g && cards.length > 1 && <div className="text-xs text-muted-foreground">{g.away.shortName} @ {g.home.shortName}</div>}</td>
                <td className="px-3 py-2.5">{p.side === "over" ? "Over" : "Under"} {p.line} {p.statLabel.toLowerCase()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums"><b>{fmtAmerican(p.bestQuote.americanOdds)}</b><div className="text-xs text-muted-foreground">{p.bestQuote.bookmaker.name}</div></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtPct(p.modelProb, 0)}</td>
                <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", ev >= 0 ? "text-neon" : "text-loss")}>{ev >= 0 ? "+" : ""}{(ev * 100).toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PropsView({ bundle }: { bundle: LiveBundle }) {
  const data = bundle.byDay.all;
  const games = open(data.matchups);
  const props = bookProps(data.props).filter((p) => games.some((c) => c.matchup.id === p.matchupId));
  const edges = props.filter((p) => p.edge >= PROP_MIN_EDGE).sort((a, b) => propEv(b) - propEv(a));
  const loaded = new Set(props.map((p) => p.matchupId));
  return (
    <>
      <Title kicker="Player props" title="Prop prices across the books" sub="Passing yards and TDs, rushing yards, receiving yards and receptions. The fair price comes from every book's line together, so an edge means one book is out of step. Each game's props load once, the day before or the morning of kickoff." />
      <LoadPropsButton />
      <p className="mb-6 text-sm text-muted-foreground">Props loaded for <b className="text-ink">{loaded.size}</b> of {games.length} games this week.</p>
      <Section title="Prop edges">
        {edges.length ? <PropsTable props={edges} cards={games} /> : <Empty text="No prop is priced 2+ points above fair right now." />}
      </Section>
      {(data.tdDerby?.length ?? 0) > 0 && (
        <Section title="Anytime TD (our model)">
          <p className="mb-3 text-xs text-muted-foreground">From our own player model, not the books: a guide to fair prices. Only bet one when a book pays more than the fair price shown.</p>
          <TdDerby list={data.tdDerby!.slice(0, 30)} modelOnly />
        </Section>
      )}
    </>
  );
}

// ---------------- Teasers ----------------

function TeaserTable({ legs, cards }: { legs: TeaserLeg[]; cards: MatchupCardData[] }) {
  if (!legs.length) return <Empty text="No teaser numbers for this game yet." />;
  const gameOf = (l: TeaserLeg) => cards.find((c) => c.matchup.home.shortName === l.team || c.matchup.away.shortName === l.team)?.matchup;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-line bg-white">
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
      <Title kicker="Teasers" title="6-point teaser finder" sub="A teaser moves every spread 6 points your way for a worse price. NFL games land on 3 and 7 so often that legs crossing both numbers have historically been one of the few sound bets. Each number below is how often similar games actually covered the teased line since 2010." />
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-line bg-white p-4"><div className="text-xs text-muted-foreground">2-team at -120 needs</div><div className="text-2xl font-black">73.9%</div><div className="text-xs text-muted-foreground">per leg to break even</div></div>
        <div className="rounded-lg border border-slate-line bg-white p-4"><div className="text-xs text-muted-foreground">3-team at +160 needs</div><div className="text-2xl font-black">72.7%</div><div className="text-xs text-muted-foreground">per leg to break even</div></div>
        <div className="rounded-lg border border-slate-line bg-white p-4"><div className="text-xs text-muted-foreground">Legs this week clearing</div><div className="text-2xl font-black text-neon">{good.length} · {good3.length}</div><div className="text-xs text-muted-foreground">the 2-team · 3-team bar, of {legs.length}</div></div>
      </div>
      {combos.map((c) => {
        const p = c.legs.reduce((x, l) => x * l.prob, 1);
        const ev = p * c.payout - 1;
        return (
          <Section key={c.title} title={c.title}>
            <div className="rounded-lg border-2 border-brand bg-white p-4">
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
