/**
 * Best bets for every NFL and college game this week, and the inputs for "best of the day".
 *
 *   in:  public/data/live.json   (NFL props with book prices; NFL + college game lines with every book + consensus)
 *        public/data/teams.json  (every team's games: scores, halves, quarters, closing lines; this week's games)
 *        nflverse weekly player stats (player game logs, what each defense allows to each position)
 *        ESPN game previews (NFL injuries)
 *   out: public/data/best-bets.json
 *        { updatedAt, leagues: { NFL|NCAAF: { games: { [espnEventId]: { start, home, away, bets: Bet[] } } } } }
 *
 * How a bet is judged: start from the market's fair chance (books' no-juice consensus) and move it by what the
 * numbers say (hit rates, matchup, injuries, game script, team trends). Edge = that chance x the best payout - 1.
 * Halves and quarters have no odds feed: they use an estimated line (half / a quarter of the full-game number) at -110
 * and are labeled "est. line" so the real line gets checked in the app.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DATA = path.join("public", "data");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return null; } };
async function get(url, type = "json") {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { "user-agent": "hunters-sauce" } }); if (r.ok) return type === "json" ? r.json() : Buffer.from(await r.arrayBuffer()); } catch {}
    await new Promise((res) => setTimeout(res, 700 * (i + 1)));
  }
  return null;
}
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const imp = (o) => 1 / dec(o);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r3 = (x) => Math.round(x * 1000) / 1000;
const f1 = (x) => (Math.round(x * 10) / 10).toString();
const nm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const fmt = (o) => (o > 0 ? "+" + Math.round(o) : String(Math.round(o)));
const pct = (x) => Math.round(x * 100) + "%";
const sgn = (x) => (x > 0 ? "+" + x : x === 0 ? "PK" : String(x));
const EST_ODDS = -110;

/* ---------------- team trends ---------------- */
function rec(games, f) { let w = 0, l = 0; for (const g of games) { const x = f(g); if (x == null) continue; if (x > 0) w++; else if (x < 0) l++; } return { w, l, n: w + l, p: w + l ? w / (w + l) : 0.5 }; }
// shrink a rate toward 50% by sample size (8 games of evidence ~ halfway)
const lean = (r) => (r.n ? (r.p - 0.5) * (r.n / (r.n + 8)) : 0);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const PER = { full: [0, 4], h1: [0, 2], q1: [0, 1], q2: [1, 2], q3: [2, 3], q4: [3, 4] };
const PERNAME = { full: "", h1: "1H", q1: "1Q", q2: "2Q", q3: "3Q", q4: "4Q" };
let share = { full: 1, h1: 0.5, q1: 0.25, q2: 0.25, q3: 0.25, q4: 0.25 };
/** each period's real share of scoring this season (2nd and 4th quarters score more than the 1st and 3rd) */
function periodShares(T) {
  const tot = { full: 0, h1: 0, q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const t of Object.values(T)) for (const g of t.games) {
    if (!g.qf || !g.qa || g.h1f == null) continue;
    tot.full += g.pf + g.pa; tot.h1 += g.h1f + g.h1a;
    ["q1", "q2", "q3", "q4"].forEach((q, i) => (tot[q] += g.qf[i] + g.qa[i]));
  }
  if (!tot.full) return share;
  return Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, Math.round((v / tot.full) * 1000) / 1000]));
}
function seg(g, per) {
  if (per === "full") return [g.pf, g.pa];
  if (per === "h1") return g.h1f == null ? null : [g.h1f, g.h1a];
  if (!g.qf || !g.qa) return null;
  const [a, b] = PER[per]; let x = 0, y = 0; for (let i = a; i < b; i++) { x += g.qf[i]; y += g.qa[i]; } return [x, y];
}
// how a team does in a period vs that period's share of the closing spread / total
function trend(t, per) {
  const G = t.games.filter((g) => seg(g, per));
  const s = (g) => seg(g, per);
  return {
    n: G.length,
    win: rec(G, (g) => s(g)[0] - s(g)[1]),
    ats: rec(G, (g) => (g.line == null ? null : s(g)[0] - s(g)[1] + g.line * share[per])),
    ou: rec(G, (g) => (g.total == null ? null : s(g)[0] + s(g)[1] - g.total * share[per])),
    pf: avg(G.map((g) => s(g)[0])), pa: avg(G.map((g) => s(g)[1])),
  };
}

/* ---------------- NFL players (nflverse) ---------------- */
const COLS = ["completions", "attempts", "passing_yards", "passing_tds", "carries", "rushing_yards", "rushing_tds", "receptions", "targets", "receiving_yards", "receiving_tds"];
const FIXT = { LA: "LAR", WAS: "WSH" };
async function nflPlayers(year) {
  const gz = await get(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${year}.csv.gz`, "buf");
  if (!gz) return null;
  const lines = zlib.gunzipSync(gz).toString("utf8").trim().split("\n");
  const split = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const hd = split(lines[0]), ix = (k) => hd.indexOf(k);
  const I = { name: ix("player_display_name"), pos: ix("position"), team: ix("team"), opp: ix("opponent_team"), week: ix("week"), type: ix("season_type") };
  const ci = COLS.map(ix);
  const rows = [];
  for (const l of lines.slice(1)) {
    const c = split(l);
    if (c[I.type] === "PRE") continue;
    const v = {}; COLS.forEach((k, i) => (v[k] = Number(c[ci[i]]) || 0));
    rows.push({ name: c[I.name], key: nm(c[I.name]), pos: c[I.pos], team: FIXT[c[I.team]] || c[I.team], opp: FIXT[c[I.opp]] || c[I.opp], week: Number(c[I.week]), v });
  }
  return rows;
}
const STAT = {
  passing_yards: { f: (v) => v.passing_yards, lbl: "pass yds", grp: ["QB"] },
  passing_tds: { f: (v) => v.passing_tds, lbl: "pass TDs", grp: ["QB"] },
  completions: { f: (v) => v.completions, lbl: "completions", grp: ["QB"] },
  passing_attempts: { f: (v) => v.attempts, lbl: "pass attempts", grp: ["QB"] },
  rushing_yards: { f: (v) => v.rushing_yards, lbl: "rush yds", grp: ["RB", "QB", "WR"] },
  rushing_attempts: { f: (v) => v.carries, lbl: "carries", grp: ["RB"] },
  receiving_yards: { f: (v) => v.receiving_yards, lbl: "rec yds", grp: ["WR", "TE", "RB"] },
  receptions: { f: (v) => v.receptions, lbl: "receptions", grp: ["WR", "TE", "RB"] },
  rush_rec_yds: { f: (v) => v.rushing_yards + v.receiving_yards, lbl: "rush+rec yds", grp: ["RB", "WR", "TE"] },
  anytime_td: { f: (v) => v.rushing_tds + v.receiving_tds, lbl: "TD", grp: ["RB", "WR", "TE", "QB"] },
};
const PGRP = (pos) => (pos === "FB" ? "RB" : pos);
/** what each defense allows per game to a position for a stat, ranked (1 = allows the most) */
function defenseTable(rows) {
  const games = new Map();                            // defense -> set of weeks
  const tot = new Map();                              // `${def}|${pos}|${stat}` -> sum
  for (const r of rows) {
    if (!r.opp) continue;
    (games.get(r.opp) || games.set(r.opp, new Set()).get(r.opp)).add(r.week);
    for (const [k, s] of Object.entries(STAT)) { const key = `${r.opp}|${PGRP(r.pos)}|${k}`; tot.set(key, (tot.get(key) || 0) + s.f(r.v)); }
  }
  const out = {};
  for (const k of Object.keys(STAT)) for (const pos of ["QB", "RB", "WR", "TE"]) {
    const list = [...games.keys()].map((d) => ({ d, pg: (tot.get(`${d}|${pos}|${k}`) || 0) / games.get(d).size }));
    const lg = avg(list.map((x) => x.pg));
    list.sort((a, b) => b.pg - a.pg).forEach((x, i) => (out[`${x.d}|${pos}|${k}`] = { pg: x.pg, rank: i + 1, ratio: lg ? x.pg / lg : 1, of: list.length }));
  }
  return out;
}

/* ---------------- lineups: who's actually playing ---------------- */
const isOut = (st) => /out|reserve|doubt|suspend/i.test(st || "");
const NEW_OUT = (st) => /^out|doubt/i.test(st || "") && !/reserve/i.test(st || "");     // new this week (IR is already in the recent stats)
const QB_DEP = /passing|completions|receiv|recept|rush_rec/;                         // stats that ride on the QB
/** The team's usual QB, who's expected to start this week, and the weeks that QB started. */
function teamQB(rows, team, inj) {
  const byWeek = new Map();
  for (const r of rows) if (r.team === team && r.pos === "QB" && r.v.attempts >= 10) { const c = byWeek.get(r.week); if (!c || r.v.attempts > c.v.attempts) byWeek.set(r.week, r); }
  const weeks = [...byWeek.keys()].sort((a, b) => b - a);
  if (!weeks.length) return null;
  const starterOf = (w) => byWeek.get(w).name;
  const recent = weeks.slice(0, 4).map(starterOf);
  const count = (n) => recent.filter((x) => x === n).length;
  const usual = [...new Set(recent)].sort((a, b) => count(b) - count(a) || recent.indexOf(a) - recent.indexOf(b))[0];
  const status = (n) => inj.find((i) => nm(i.name) === nm(n))?.status;
  // candidates: most recent starters first, then anyone else on the team who threw
  const names = [...new Set([...weeks.map(starterOf), ...rows.filter((r) => r.team === team && r.pos === "QB").sort((a, b) => b.week - a.week).map((r) => r.name)])];
  const expected = names.find((n) => !isOut(status(n))) || null;
  const qbWeeks = weeks.filter((w) => starterOf(w) === expected);
  return { usual, usualStatus: status(usual), expected, changed: !!expected && expected !== usual, qbWeeks, starts: qbWeeks.length };
}
/** Weeks where the player had his normal role (skips games he barely played, e.g. left hurt). */
function roleWeeks(mine) {
  const inv = (r) => (r.pos === "QB" ? r.v.attempts : r.v.targets + r.v.carries);
  const xs = mine.map(inv).sort((a, b) => a - b), med = xs[xs.length >> 1] || 0;
  return mine.filter((r) => med < 3 || inv(r) >= 0.35 * med).map((r) => r.week);
}
const DB = /^(CB|S|FS|SS|DB)$/, RUSH = /^(DE|DT|NT|EDGE|OLB|DL)$/;

/* ---------------- game lines from the board ---------------- */
function boardGames(live, lg) {
  return (live?.byDay?.all?.matchups || []).filter((c) => c.matchup.league === lg && c.matchup.status === "scheduled");
}
const sameTeam = (a, t) => { const x = nm(a.name), y = nm(t.name); return x && y && (x === y || x.includes(y) || y.includes(x) || nm(a.shortName) === nm(t.short)); };

/* ---------------- main ---------------- */
async function main() {
  const now = Date.now();
  const live = read("live.json"), teams = read("teams.json");
  if (!teams) { console.log("best-bets: no team data"); return; }
  const year = new Date().getMonth() < 2 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  const out = { updatedAt: new Date(now).toISOString(), leagues: {} };

  for (const lg of ["NFL", "NCAAF"]) {
    const L = teams.leagues?.[lg]; if (!L) continue;
    const T = L.teams;
    share = periodShares(T);
    console.log(`best-bets: ${lg} scoring share by period ${JSON.stringify(share)}`);
    const games = {};
    let droppedTotal = 0;
    const ctxOut = {};
    const ups = (L.upcoming || []).filter((u) => u.state === "pre" && T[u.home] && T[u.away]);
    const board = boardGames(live, lg);

    // NFL extras: player logs, defense table, injuries
    let rows = null, def = null;
    const inj = {};
    if (lg === "NFL") {
      rows = await nflPlayers(year);
      if (rows) def = defenseTable(rows);
      await Promise.all(ups.map(async (u) => {
        const s = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${u.id}`);
        for (const blk of s?.injuries || []) inj[String(blk.team?.id)] = (blk.injuries || []).map((i) => ({ name: i.athlete?.displayName, pos: i.athlete?.position?.abbreviation, status: i.status }));
      }));
    }

    for (const u of ups) {
      const H = T[u.home], A = T[u.away];
      const bets = [];
      const card = board.find((c) => sameTeam(c.matchup.home, H) && sameTeam(c.matchup.away, A));
      const qbG = lg === "NFL" && rows ? { home: teamQB(rows, H.abbr, inj[u.home] || []), away: teamQB(rows, A.abbr, inj[u.away] || []) } : {};
      const tShort = (side) => (side === "home" ? H.short || H.abbr : A.short || A.abbr);

      /* --- full-game lines with real prices --- */
      for (const v of card ? [card.recommended, ...(card.otherBets || [])] : []) {
        if (!v || !["moneyline", "spread", "total"].includes(v.market) || !v.marketProb || !v.bestQuote) continue;
        const odds = v.bestQuote.americanOdds, fair = v.marketProb;
        const why = [];
        let tilt = 0;
        if (v.market === "total") {
          const th = trend(H, "full"), ta = trend(A, "full");
          const sgnSide = v.side === "over" ? 1 : -1;
          const comb = (th.pf + th.pa + ta.pf + ta.pa) / 2;
          const recSig = sgnSide * (lean(th.ou) + lean(ta.ou)), avgSig = sgnSide * (comb - v.line);
          // only lean when the over/under records and the scoring average point the same way
          tilt = recSig > 0 && avgSig > 0 ? 0.35 * Math.abs(lean(th.ou) + lean(ta.ou)) + Math.min(0.01, Math.abs(comb - v.line) / 200) : 0;
          why.push(`${H.short} games went over ${th.ou.w} of ${th.ou.n}; ${A.short} games ${ta.ou.w} of ${ta.ou.n}`);
          if (Number.isFinite(comb)) why.push(`Their games average ${f1(comb)} total points vs this ${v.line} line`);
        } else {
          const me = v.side === "home" ? H : A, op = v.side === "home" ? A : H;
          const tm = trend(me, "full"), to = trend(op, "full");
          if (v.market === "spread") {
            tilt = 0.35 * (lean(tm.ats) - lean(to.ats));
            why.push(`${me.short} cover ${tm.ats.w} of ${tm.ats.n}; ${op.short} cover ${to.ats.w} of ${to.ats.n}`);
          } else {
            const fav = (v.line ?? 0) < 0 || imp(odds) > 0.5;
            const r = rec(me.games.filter((g) => g.line != null && (fav ? g.line < 0 : g.line > 0)), (g) => g.pf - g.pa);
            tilt = 0.35 * (lean(tm.win) - lean(to.win));
            why.push(`${me.short} are ${tm.win.w}-${tm.win.l}${r.n ? ` (${r.w}-${r.l} as ${fav ? "favorite" : "underdog"})` : ""}; ${op.short} are ${to.win.w}-${to.win.l}`);
          }
          if (Number.isFinite(tm.pf)) why.push(`${me.short} score ${f1(tm.pf)} and allow ${f1(tm.pa)} a game; ${op.short} score ${f1(to.pf)} and allow ${f1(to.pa)}`);
        }
        tilt = clamp(tilt, -0.03, 0.03);
        // a brand-new QB: don't back that team on a side, and say so either way
        let qbSkip = false;
        if (v.market !== "total") {
          const mySide = v.side, opSide = v.side === "home" ? "away" : "home";
          const mq = qbG[mySide], oq = qbG[opSide];
          if (mq?.changed && mq.starts < 3) { qbSkip = true; }
          if (oq?.changed) why.push(`${opSide === "home" ? H.short : A.short} start ${oq.expected} at QB (${oq.starts} start${oq.starts === 1 ? "" : "s"} this year)`);
        } else for (const sd of ["home", "away"]) { const q = qbG[sd]; if (q?.changed) why.push(`⚠️ ${sd === "home" ? H.short : A.short} start ${q.expected} at QB`); }
        if (qbSkip) continue;
        const p = clamp(fair + tilt, 0.02, 0.98);
        why.push(`Best price ${fmt(odds)} at ${v.bestQuote.bookmaker?.name || "the books"}; market says ${pct(fair)}, trends move it to ${pct(p)}`);
        bets.push({ kind: "line", market: v.market, period: "full", side: v.side, line: v.line ?? null, label: v.label, odds, book: v.bestQuote.bookmaker?.name, est: false, p: r3(p), edge: r3(p * dec(odds) - 1), why });
      }

      /* --- halves and quarters: estimated lines + trends --- */
      const pers = lg === "NFL" ? ["h1"] : ["h1", "q1", "q2", "q3", "q4"];
      for (const per of pers) {
        const th = trend(H, per), ta = trend(A, per);
        if (th.n < 4 || ta.n < 4) continue;
        const P = PERNAME[per];
        if (u.homeLine != null) {
          const hl = Math.round(u.homeLine * share[per] * 2) / 2;
          for (const side of ["home", "away"]) {
            const me = side === "home" ? th : ta, op = side === "home" ? ta : th;
            const line = side === "home" ? hl : -hl;
            const p = clamp(0.5 + 0.3 * (lean(me.ats) - lean(op.ats)), 0.42, 0.58);
            bets.push({ kind: "period", market: "spread", period: per, side, line, label: `${tShort(side)} ${P} ${sgn(line)}`, odds: EST_ODDS, est: true, p: r3(p), edge: r3(p * dec(EST_ODDS) - 1),
              why: [`${tShort(side)} covered the ${P} ${me.ats.w} of ${me.ats.n} times; ${tShort(side === "home" ? "away" : "home")} covered ${op.ats.w} of ${op.ats.n}`,
                `${tShort(side)} outscore teams ${f1(me.pf)}-${f1(me.pa)} in the ${P}`,
                `Estimated ${P} line from the full-game ${sgn(side === "home" ? u.homeLine : -u.homeLine)}: check the real line in your app`] });
          }
        }
        if (u.total != null) {
          const line = Math.round(u.total * share[per] * 2) / 2;
          const both = (th.pf + th.pa + ta.pf + ta.pa) / 2;
          for (const side of ["over", "under"]) {
            const s = side === "over" ? 1 : -1;
            const recS = s * (lean(th.ou) + lean(ta.ou)), avgS = s * (both - line);
            if (!(recS > 0 && avgS > 0)) continue;                  // records and averages must agree
            const p = clamp(0.5 + 0.3 * 0.5 * Math.abs(lean(th.ou) + lean(ta.ou)) + clamp(Math.abs(both - line) / (line || 1), 0, 0.15) * 0.15, 0.42, 0.58);
            bets.push({ kind: "period", market: "total", period: per, side, line, label: `${P} ${side === "over" ? "Over" : "Under"} ${line}`, odds: EST_ODDS, est: true, p: r3(p), edge: r3(p * dec(EST_ODDS) - 1),
              why: [`${H.short} ${P}s went over ${th.ou.w} of ${th.ou.n}; ${A.short} ${P}s ${ta.ou.w} of ${ta.ou.n}`, `Their ${P}s average ${f1(both)} points combined vs ${line}`, `Estimated ${P} total from the full-game ${u.total}: check the real line in your app`] });
          }
        }
      }

      /* --- NFL player props --- */
      if (lg === "NFL" && rows && def) {
        const injH = inj[u.home] || [], injA = inj[u.away] || [];
        const qbs = { home: teamQB(rows, H.abbr, injH), away: teamQB(rows, A.abbr, injA) };
        const dOut = { home: injH.filter((i) => NEW_OUT(i.status)), away: injA.filter((i) => NEW_OUT(i.status)) };
        for (const sd of ["home", "away"]) { const q = qbs[sd]; if (q?.changed) console.log(`best-bets: QB change · ${sd === "home" ? H.abbr : A.abbr}: ${q.expected} starts (usual ${q.usual}${q.usualStatus ? ", " + q.usualStatus : ""}) · ${q.starts} start(s) with him`); }
        const props = (live?.byDay?.all?.props || []).filter((p) => card && p.matchupId === card.matchup.id && !p.isAlt && STAT[p.stat]);
        const grp = new Map();
        for (const p of props) {
          const k = nm(p.playerName) + "|" + p.stat + "|" + p.line;
          const g = grp.get(k) || { name: p.playerName, stat: p.stat, line: p.line, over: null, under: null };
          const q = { odds: p.bestQuote?.americanOdds, book: p.source === "kalshi" ? "Kalshi" : p.bestQuote?.bookmaker?.name };
          if (p.side === "over" || p.side === "yes") { if (!g.over || q.odds > g.over.odds) g.over = q; } else if (!g.under || q.odds > g.under.odds) g.under = q;
          grp.set(k, g);
        }
        for (const g of grp.values()) {
          const allMine = rows.filter((r) => r.key === nm(g.name)).sort((a, b) => b.week - a.week);
          if (!allMine.length) continue;
          const pos = PGRP(allMine[0].pos), team = allMine[0].team;
          const side = team === H.abbr ? "home" : team === A.abbr ? "away" : null;
          if (!side) continue;
          const opp = side === "home" ? A.abbr : H.abbr, oside = side === "home" ? "away" : "home";
          const S = STAT[g.stat];
          // only games that look like this week: his normal role, and (for passing stats) the QB who starts this week
          const qb = qbs[side], ctxKey = nm(g.name);
          const rw = new Set(roleWeeks(allMine));
          const needQB = QB_DEP.test(g.stat) && qb?.changed;
          const qbW = new Set(qb?.qbWeeks || []);
          let mine = allMine.filter((r) => rw.has(r.week) && (!needQB || qbW.has(r.week)));
          const flags = [];
          if (qb?.changed && (QB_DEP.test(g.stat) || pos === "QB")) flags.push(`New QB: ${qb.expected}${qb.usualStatus ? ` (${qb.usual} ${/reserve/i.test(qb.usualStatus) ? "on IR" : qb.usualStatus.toLowerCase()})` : ""}`);
          const ctx = (ctxOut[ctxKey] ||= { team, pos, weeks: [...rw].sort((a, b) => b - a), qbWeeks: qb?.changed ? [...qbW].sort((a, b) => b - a) : null, flags: [] });
          for (const f of flags) if (!ctx.flags.includes(f)) ctx.flags.push(f);
          const newQBthin = needQB && mine.length < 3;
          if (mine.length < (needQB ? 2 : 5)) continue;
          const vals = mine.map((r) => S.f(r.v));
          const me = (inj[side === "home" ? u.home : u.away] || []);
          const self = me.find((i) => nm(i.name) === nm(g.name));
          if (self && !ctx.flags.some((f) => f.startsWith("Listed"))) ctx.flags.push(`Listed ${self.status}`);
          if (self && /out|doubt|reserve/i.test(self.status)) continue;
          // matchup, injuries, script -> a multiplier on his numbers
          const d = def[`${opp}|${pos}|${g.stat}`];
          let mult = d ? 1 + (d.ratio - 1) * 0.5 : 1;
          const why = [];
          const outMates = me.filter((i) => NEW_OUT(i.status) && i.pos && PGRP(i.pos) === pos && nm(i.name) !== nm(g.name));
          if (outMates.length) { const f = `Teammate out: ${outMates[0].name}`; if (!ctx.flags.includes(f)) ctx.flags.push(f); }
          // the defense he faces: starters newly out
          const dbs = dOut[oside].filter((i) => DB.test(i.pos || "")), rushers = dOut[oside].filter((i) => RUSH.test(i.pos || ""));
          if (/receiv|recept|passing|completions/.test(g.stat) && dbs.length) {
            mult *= dbs.length >= 2 ? 1.05 : 1.02;
            why.push(`${opp}'s secondary is missing ${dbs.slice(0, 2).map((i) => i.name).join(" and ")}`);
            const f = `${opp} missing ${dbs.length} DB${dbs.length > 1 ? "s" : ""}`; if (!ctx.flags.includes(f)) ctx.flags.push(f);
          }
          if (/passing/.test(g.stat) && rushers.length >= 2) { mult *= 1.02; why.push(`${opp} are without pass rushers ${rushers.slice(0, 2).map((i) => i.name).join(" and ")}`); }
          if (needQB) why.unshift(`${qb.expected} starts at QB${qb.usualStatus ? ` with ${qb.usual} ${/reserve/i.test(qb.usualStatus) ? "on IR" : "out"}` : ""}: these numbers only use ${mine.length} game${mine.length === 1 ? "" : "s"} with him`);
          const recStat = /receiv|recept|rush_rec/.test(g.stat), rushStat = /rush/.test(g.stat);
          if (outMates.length && (recStat || (rushStat && pos === "RB"))) { mult *= 1.06; why.push(`With ${outMates.slice(0, 2).map((i) => i.name).join(" and ")} out, more ${recStat ? "targets" : "carries"} open up`); }
          const myLine = side === "home" ? u.homeLine : u.homeLine == null ? null : -u.homeLine;
          if (myLine != null && rushStat && pos === "RB" && Math.abs(myLine) >= 6) mult *= myLine < 0 ? 1.04 : 0.96;
          if (myLine != null && /passing|receiv|recept/.test(g.stat) && myLine >= 6) mult *= 1.03;
          if (u.total != null && /yards|recept|completions/.test(g.stat)) mult *= u.total >= 48 ? 1.02 : u.total <= 40 ? 0.98 : 1;
          const last = vals.slice(0, 8);
          const hits = last.filter((x) => x > g.line).length, adjHits = last.filter((x) => x * mult > g.line).length;
          const both = !!(g.over && g.under);
          // market fair chance of the over
          let fairOver;
          if (g.over && g.under) { const a = imp(g.over.odds), b = imp(g.under.odds); fairOver = a / (a + b); }
          else if (g.over) fairOver = imp(g.over.odds) / 1.045; else if (g.under) fairOver = 1 - imp(g.under.odds) / 1.045; else continue;
          // his (matchup-adjusted) hit rate, pulled toward the market; one-sided prices are trusted less, and the
          // numbers can move the market by 7 points at most
          const k = both ? 10 : 16;
          const pOver = clamp(clamp((adjHits + k * fairOver) / (last.length + k), fairOver - 0.07, fairOver + 0.07), 0.03, 0.97);
          const avgV = avg(last), szn = avg(vals);
          for (const s of ["over", "under"]) {
            const q = g[s]; if (!q || q.odds == null) continue;
            if (g.stat === "anytime_td" && s === "under") continue;
            if (newQBthin && s !== "under") continue;            // new QB and almost no games with him: no overs that ride on him
            if (q.odds < -250 || q.odds > (g.stat === "anytime_td" ? 350 : 200)) continue;
            const p = s === "over" ? pOver : 1 - pOver;
            const myHits = (s === "over" ? hits : last.length - hits) / Math.max(1, last.length);
            if (myHits < imp(q.odds) - 0.05) continue;            // his history has to back the price, not just the matchup
            const w = [];
            w.push(`${s === "over" ? "Went over" : "Stayed under"} ${g.line} in ${s === "over" ? hits : last.length - hits} of his last ${last.length} (averaging ${f1(avgV)}, season ${f1(szn)})`);
            if (d) w.push(`${opp} allow the ${d.rank <= d.of / 2 ? ord(d.rank) + "-most" : ord(d.of + 1 - d.rank) + "-fewest"} ${S.lbl} to ${pos}s (${f1(d.pg)} a game)`);
            w.push(...why);
            if (self) w.push(`Heads up: he's listed ${self.status}`);
            if (myLine != null) w.push(`${side === "home" ? H.short : A.short} are ${myLine < 0 ? Math.abs(myLine) + "-point favorites" : myLine > 0 ? myLine + "-point underdogs" : "a pick'em"}${u.total ? ` in a ${u.total} total` : ""}`);
            w.push(`Best price ${fmt(q.odds)}${q.book ? " at " + q.book : ""}; market says ${pct(s === "over" ? fairOver : 1 - fairOver)}, the numbers say ${pct(p)}`);
            if (!both) w.splice(w.length - 1, 0, "Only one side is posted, so this price is a little less certain");
            bets.push({ kind: "prop", oneSided: !both, defRank: d?.rank, defOf: d?.of, market: g.stat, period: "full", player: g.name, team: side === "home" ? H.abbr : A.abbr, pos, side: s, line: g.line,
              label: g.stat === "anytime_td" ? `${g.name} anytime TD` : `${g.name} ${s === "over" ? "O" : "U"} ${g.line} ${S.lbl}`, odds: q.odds, book: q.book, est: false, p: r3(p), edge: r3(p * dec(q.odds) - 1), why: w.slice(0, 5) });
          }
        }
      }

      // one story per game: decide the total lean (over/under) and the side lean first, then drop bets that fight it
      const ok = bets.filter((b) => (b.est ? b.p >= 0.555 : b.edge >= 0.025));
      const dirTotal = (b) => (b.market === "total" || b.kind === "prop" ? (b.side === "under" ? "under" : "over") : null);
      const dirSide = (b) => ((b.market === "spread" || b.market === "moneyline") && (b.side === "home" || b.side === "away") ? b.side : null);
      const pickLean = (list, dir) => { const best = list.filter((b) => dir(b)).sort((a, b) => b.p - a.p || b.edge - a.edge)[0]; return best ? dir(best) : null; };
      const script = {
        total: pickLean(bets.filter((b) => b.kind === "line" && b.market === "total"), dirTotal) || pickLean(bets.filter((b) => b.kind === "period" && b.market === "total" && b.period === "h1"), dirTotal) || pickLean([...ok].sort((a, b) => b.edge - a.edge).slice(0, 1), dirTotal),
        side: pickLean(bets.filter((b) => b.kind === "line" && b.market !== "total"), dirSide) || pickLean(bets.filter((b) => b.kind === "period" && b.market === "spread" && b.period === "h1"), dirSide),
      };
      const fits = (b) => {
        const t = dirTotal(b), sd = dirSide(b);
        if (t && script.total && t !== script.total) return false;
        if (sd && script.side && sd !== script.side) return false;
        // a prop never goes against its own matchup
        if (b.kind === "prop" && b.defRank) {
          const soft = b.defRank <= b.defOf / 2;               // this defense gives up a lot of this stat
          if ((b.side === "under" && soft) || (b.side !== "under" && !soft)) return false;
        }
        return true;
      };
      const dropped = ok.filter((b) => !fits(b)).length;
      droppedTotal += dropped;
      const keep = ok.filter(fits)
        .map((b) => ({ ...b, score: b.est ? b.edge * 0.6 : b.oneSided ? b.edge * 0.6 : b.edge }))
        .sort((a, b) => b.score - a.score);
      // one bet per market/period/player, best first
      const seen = new Set(), list = [];
      for (const b of keep) { const k = [b.kind, b.market, b.period, b.player || ""].join("|"); if (seen.has(k)) continue; seen.add(k); list.push(b); if (list.length >= 6) break; }
      for (const b of list) b.rating = !b.est && b.edge >= 0.07 ? "green" : "yellow";   // strong = 7%+ edge at a real price
      games[u.id] = { script, start: u.start, home: { id: H.id, abbr: H.abbr, short: H.short, logo: H.logo, rank: H.rank }, away: { id: A.id, abbr: A.abbr, short: A.short, logo: A.logo, rank: A.rank }, spread: u.homeLine, total: u.total, bets: list };
    }
    out.leagues[lg] = { games, context: lg === "NFL" ? ctxOut : undefined };
    if (lg === "NFL") { const ch = Object.values(ctxOut).filter((c) => c.qbWeeks); console.log(`best-bets: NFL lineups · ${Object.keys(ctxOut).length} prop players checked · ${ch.length} on teams with a new QB · ${Object.values(ctxOut).filter((c) => c.flags.length).length} with a warning`); }
    const all = Object.values(games).flatMap((g) => g.bets);
    console.log(`best-bets: ${lg} · ${droppedTotal} bets dropped for fighting their game's script or matchup`);
    console.log(`best-bets: ${lg} · ${Object.keys(games).length} games · ${all.length} bets (${all.filter((b) => b.kind === "prop").length} props, ${all.filter((b) => b.kind === "line").length} priced lines, ${all.filter((b) => b.est).length} est. halves/quarters) · ${rows ? rows.length + " player-weeks" : "no player stats"}`);
    const top = all.sort((a, b) => b.score - a.score).slice(0, 3);
    for (const b of top) console.log(`  ${b.label} ${fmt(b.odds)}${b.est ? " (est)" : ""} · ${pct(b.p)} · edge ${f1(b.edge * 100)}%\n    - ${b.why.join("\n    - ")}`);
  }
  fs.writeFileSync(path.join(DATA, "best-bets.json"), JSON.stringify(out));
  await record(out, teams, now);
}
/* ---------------- record: lock each game's top 3 in the last 40 minutes before kickoff, grade from finals ---------------- */
const BOX = { passing: 1, rushing: 1, receiving: 1 };
const PROP_STAT = {
  passing_yards: (r) => r.passingYards, passing_tds: (r) => r.passingTouchdowns, completions: (r) => r.completions, passing_attempts: (r) => r.passingAttempts,
  rushing_yards: (r) => r.rushingYards, rushing_attempts: (r) => r.rushingAttempts, receiving_yards: (r) => r.receivingYards, receptions: (r) => r.receptions,
  rush_rec_yds: (r) => (r.rushingYards ?? 0) + (r.receivingYards ?? 0), anytime_td: (r) => (r.rushingTouchdowns ?? 0) + (r.receivingTouchdowns ?? 0),
};
async function boxPlayers(gid) {
  const s = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gid}`);
  if (s?.header?.competitions?.[0]?.status?.type?.state !== "post") return null;
  const out = new Map();
  for (const t of s?.boxscore?.players || []) for (const cat of t.statistics || []) {
    if (!BOX[cat.name]) continue;
    for (const a of cat.athletes || []) {
      const k = nm(a.athlete?.displayName); const r = out.get(k) || {};
      (cat.keys || []).forEach((key, i) => {
        const raw = String(a.stats?.[i] ?? "");
        if (key.includes("/")) key.split("/").forEach((kk, j) => (r[kk] = Number(raw.split("/")[j]) || 0));
        else { const v = Number(raw.replace(/,/g, "")); if (Number.isFinite(v)) r[key] = v; }
      });
      out.set(k, r);
    }
  }
  return out;
}
async function record(out, teams, now) {
  const file = path.join(DATA, "best-record.json");
  let prev = read("best-record.json") || (await get("https://hunterc478-create.github.io/hunters-sauce/data/best-record.json"));
  const bets = prev?.bets || [];
  const have = new Set(bets.map((b) => b.gid));
  let logged = 0, graded = 0;
  // lock
  for (const [lg, L] of Object.entries(out.leagues)) for (const [gid, g] of Object.entries(L.games)) {
    const mins = (new Date(g.start).getTime() - now) / 60000;
    if (mins > 40 || mins <= 0 || have.has(gid)) continue;      // after the props refresh (40-90 min out), before kickoff
    for (const b of g.bets.slice(0, 3)) {
      bets.push({ id: `${gid}|${b.label}`, lg, gid, start: g.start, home: g.home, away: g.away, kind: b.kind, market: b.market, period: b.period, side: b.side, line: b.line ?? null,
        label: b.label, player: b.player, odds: b.odds, book: b.book, est: !!b.est, p: b.p, edge: b.edge, rating: b.rating, loggedAt: new Date(now).toISOString() });
      logged++;
    }
    have.add(gid);
  }
  // grade
  const boxes = new Map();
  for (const b of bets) {
    if (b.result) continue;
    if (now - new Date(b.start).getTime() < 3 * 3600_000) continue;
    let d = null;
    if (b.kind === "prop") {
      if (!boxes.has(b.gid)) boxes.set(b.gid, await boxPlayers(b.gid));
      const box = boxes.get(b.gid);
      if (box) {
        const r = box.get(nm(b.player));
        if (!r) { b.result = "void"; b.actual = "did not play"; }
        else { const v = PROP_STAT[b.market]?.(r); if (v != null) { b.actual = v; d = b.side === "under" ? b.line - v : v - b.line; } }
      }
    } else {
      const T = teams.leagues?.[b.lg]?.teams || {};
      const g = (T[b.home.id]?.games || []).find((x) => x.id === b.gid && x.home);
      const sc = g ? seg(g, b.period) : null;
      if (sc) {
        const [h, a] = sc;
        b.actual = `${b.away.abbr} ${a} – ${b.home.abbr} ${h}${b.period !== "full" ? ` (${PERNAME[b.period]})` : ""}`;
        if (b.market === "total") d = b.side === "over" ? h + a - b.line : b.line - (h + a);
        else { const m = b.side === "home" ? h - a : a - h; d = b.market === "spread" ? m + b.line : m; }
      }
    }
    if (d != null) b.result = d > 0 ? "win" : d < 0 ? "loss" : "push";
    if (!b.result && now - new Date(b.start).getTime() > 4 * 86400_000) b.result = "void";
    if (b.result) { b.units = b.result === "win" ? r3(dec(b.odds) - 1) : b.result === "loss" ? -1 : 0; graded++; }
  }
  bets.sort((a, b) => b.start.localeCompare(a.start));
  fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date(now).toISOString(), bets }));
  const s = bets.filter((b) => b.result && b.result !== "void");
  console.log(`best-bets record: ${logged} locked · ${graded} graded · ${s.filter((b) => b.result === "win").length}-${s.filter((b) => b.result === "loss").length} · ${f1(s.reduce((a, b) => a + b.units, 0))}u · ${bets.filter((b) => !b.result).length} open`);
}

main().catch((e) => { console.error("best-bets failed:", e); process.exitCode = 0; });
