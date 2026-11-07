/**
 * Team trends for the Teams tab: every completed game this season with full-game and first-half scores and the
 * closing spread/total, for NFL and college (FBS), plus this week's lines.
 *
 *   out: public/data/teams.json
 *   { updatedAt, leagues: { NFL|NCAAF: { week, teams: { [id]: Team }, upcoming: Upcoming[] } } }
 *   Team  = { id, abbr, name, short, logo, rank?, games: G[] }   (newest game first)
 *   G     = { d, opp, oppId, home, pf, pa, h1f, h1a, line?, total? }   line = this team's spread (-3.5 = favored by 3.5)
 *
 * Scores, halves and most lines: ESPN scoreboards, week by week. NFL lines missing at ESPN are filled from nflverse.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join("public", "data", "teams.json");
const UA = { "user-agent": "hunters-sauce" };
const L = {
  NFL: { sb: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", q: "", logo: (t) => `https://a.espncdn.com/i/teamlogos/nfl/500/${t.abbreviation.toLowerCase()}.png` },
  NCAAF: { sb: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard", q: "&groups=80&limit=400", logo: (t) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png` },
};

async function get(url, type = "json") {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return type === "json" ? r.json() : r.text(); } catch {}
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}

/** This team's spread from ESPN's odds block (details like "KC -3.5" / "EVEN"). */
function linesFor(comp) {
  const o = (comp.odds || [])[0];
  if (!o) return {};
  const total = Number(o.overUnder) || undefined;
  const home = comp.competitors.find((c) => c.homeAway === "home"), away = comp.competitors.find((c) => c.homeAway === "away");
  let homeLine;
  const det = String(o.details || "").trim();
  if (/^even|^pk|pick/i.test(det)) homeLine = 0;
  else {
    const m = det.match(/^(\S+)\s+([+-]?\d+(\.\d+)?)$/);
    if (m) {
      const x = -Math.abs(Number(m[2]));
      if (m[1] === home.team.abbreviation) homeLine = x; else if (m[1] === away.team.abbreviation) homeLine = -x;
    }
    if (homeLine == null && Number.isFinite(Number(o.spread)) && (o.homeTeamOdds || o.awayTeamOdds)) {
      const s = Math.abs(Number(o.spread));
      homeLine = o.homeTeamOdds?.favorite ? -s : o.awayTeamOdds?.favorite ? s : undefined;
    }
  }
  return { homeLine, total };
}
/** Per-game odds (ESPN core API) for finished games whose scoreboard dropped the line. */
const CORE = { NFL: "football/leagues/nfl", NCAAF: "football/leagues/college-football" };
async function coreLines(lg, id, homeAbbr, awayAbbr) {
  const d = await get(`https://sports.core.api.espn.com/v2/sports/${CORE[lg]}/events/${id}/competitions/${id}/odds`);
  const it = (d?.items || []).find((x) => x.details || x.spread != null) || (d?.items || [])[0];
  if (!it) return null;
  const comp = { odds: [it], competitors: [{ homeAway: "home", team: { abbreviation: homeAbbr } }, { homeAway: "away", team: { abbreviation: awayAbbr } }] };
  const r = linesFor(comp);
  return r.homeLine == null && r.total == null ? null : r;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }

const quarters = (c) => { const ls = (c.linescores || []).map((l) => Number(l.value) || 0); return ls.length >= 4 ? ls.slice(0, 4) : null; };
const half = (c) => { const ls = (c.linescores || []).map((l) => Number(l.value) || 0); return ls.length >= 2 ? ls[0] + ls[1] : null; };

async function league(lg, year) {
  const cfg = L[lg];
  const now = await get(`${cfg.sb}?${cfg.q.slice(1)}`);
  if (!now) return null;
  const week = now.week?.number || 1, stype = now.season?.type || 2;
  const teams = {}, upcoming = [];
  let finals = 0, withLine = 0;
  const weeks = [];
  for (let w = 1; w <= (stype === 2 ? week : 18); w++) weeks.push([2, w]);
  if (stype === 3) for (let w = 1; w <= week; w++) weeks.push([3, w]);
  const boards = await Promise.all(weeks.map(([st, w]) => get(`${cfg.sb}?seasontype=${st}&week=${w}&dates=${year}${cfg.q}`)));
  boards.forEach((b, i) => {
    for (const ev of b?.events || []) {
      const comp = ev.competitions?.[0];
      if (!comp || comp.competitors?.length !== 2) continue;
      const state = comp.status?.type?.state;
      const { homeLine, total } = linesFor(comp);
      const cs = comp.competitors.map((c) => {
        const t = c.team;
        const tm = (teams[t.id] ||= { id: t.id, abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.location, logo: cfg.logo(t), games: [] });
        const rk = c.curatedRank?.current; if (rk && rk <= 25) tm.rank = rk;
        return { c, tm };
      });
      const [h, a] = cs[0].c.homeAway === "home" ? cs : [cs[1], cs[0]];
      if (state === "post") {
        finals++; if (homeLine != null) withLine++;
        const hs = Number(h.c.score?.value ?? h.c.score) || 0, as = Number(a.c.score?.value ?? a.c.score) || 0;
        const h1h = half(h.c), h1a = half(a.c), qh = quarters(h.c), qa = quarters(a.c);
        const base = { id: ev.id, d: ev.date, wk: weeks[i][1], st: weeks[i][0], total };
        h.tm.games.push({ ...base, opp: a.tm.abbr, oppId: a.tm.id, home: true, pf: hs, pa: as, h1f: h1h, h1a: h1a, qf: qh, qa: qa, line: homeLine });
        a.tm.games.push({ ...base, opp: h.tm.abbr, oppId: h.tm.id, home: false, pf: as, pa: hs, h1f: h1a, h1a: h1h, qf: qa, qa: qh, line: homeLine == null ? undefined : -homeLine });
      } else if (weeks[i][1] === week && weeks[i][0] === stype) {
        upcoming.push({ id: ev.id, start: ev.date, state, home: h.tm.id, away: a.tm.id, homeLine, total, hs: Number(h.c.score?.value ?? h.c.score) || 0, as: Number(a.c.score?.value ?? a.c.score) || 0, detail: comp.status?.type?.shortDetail });
      }
    }
  });
  return { week, teams, upcoming, finals, withLine };
}

async function fillFromCore(lg, r, prev) {
  const cache = new Map();
  for (const t of Object.values(prev?.leagues?.[lg]?.teams || {})) for (const g of t.games) if (g.home && (g.line != null || g.total != null)) cache.set(g.id, { homeLine: g.line, total: g.total });
  const need = new Map();
  for (const t of Object.values(r.teams)) for (const g of t.games) if (g.home && g.line == null) need.set(g.id, { g, t });
  let fromCache = 0, fetched = 0;
  const found = new Map();
  for (const [id] of need) if (cache.has(id)) { found.set(id, cache.get(id)); fromCache++; }
  const todo = [...need.keys()].filter((id) => !found.has(id)).slice(0, 900);
  await pool(todo, 12, async (id) => { const { g, t } = need.get(id); const x = await coreLines(lg, id, t.abbr, g.opp); if (x) { found.set(id, x); fetched++; } });
  for (const t of Object.values(r.teams)) for (const g of t.games) {
    const x = found.get(g.id); if (!x) continue;
    if (g.line == null && x.homeLine != null) g.line = g.home ? x.homeLine : -x.homeLine;
    if (g.total == null && x.total != null) g.total = x.total;
  }
  return { fromCache, fetched, tried: todo.length };
}

/** NFL: fill lines ESPN didn't keep, from nflverse (spread_line = home margin the market expected). */
async function nflverseFill(out, year) {
  const csv = await get("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", "text");
  if (!csv) return 0;
  const rows = csv.trim().split("\n"), hd = rows[0].split(","), ix = (k) => hd.indexOf(k);
  const [iS, iW, iH, iA, iSp, iT] = ["season", "week", "home_team", "away_team", "spread_line", "total_line"].map(ix);
  const fix = { LA: "LAR", WAS: "WSH" };
  const byKey = new Map();
  for (const r of rows.slice(1)) {
    const c = r.split(",");
    if (Number(c[iS]) !== year) continue;
    byKey.set(`${c[iW]}|${fix[c[iH]] || c[iH]}|${fix[c[iA]] || c[iA]}`, { sp: Number(c[iSp]), t: Number(c[iT]) });
  }
  let n = 0;
  for (const tm of Object.values(out.teams)) for (const g of tm.games) {
    if (g.line != null && g.total != null) continue;
    const wk = g.st === 3 ? 18 + g.wk : g.wk;
    const k = g.home ? `${wk}|${tm.abbr}|${g.opp}` : `${wk}|${g.opp}|${tm.abbr}`;
    const x = byKey.get(k);
    if (!x) continue;
    if (g.line == null && Number.isFinite(x.sp)) { g.line = g.home ? -x.sp : x.sp; n++; }
    if (g.total == null && Number.isFinite(x.t)) g.total = x.t;
  }
  return n;
}

async function main() {
  const d = new Date(), year = d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
  const out = { updatedAt: d.toISOString(), leagues: {} };
  const prev = await get("https://hunterc478-create.github.io/hunters-sauce/data/teams.json");
  for (const lg of ["NFL", "NCAAF"]) {
    const r = await league(lg, year);
    if (!r) { console.log(`teams: ${lg} scoreboard didn't answer`); continue; }
    let filled = 0;
    if (lg === "NFL") filled = await nflverseFill(r, year);
    const core = await fillFromCore(lg, r, prev);
    console.log(`teams: ${lg} per-game odds · ${core.fromCache} games from cache · ${core.fetched}/${core.tried} fetched`);
    for (const t of Object.values(r.teams)) t.games.sort((a, b) => b.d.localeCompare(a.d));
    const h1 = Object.values(r.teams).flatMap((t) => t.games).filter((g) => g.h1f != null).length;
    const all = Object.values(r.teams).flatMap((t) => t.games).length;
    console.log(`teams: ${lg} week ${r.week} · ${Object.keys(r.teams).length} teams · ${r.finals} finals · lines on ${r.withLine} from ESPN${lg === "NFL" ? ` + ${filled / 2} from nflverse` : ""} · halves on ${h1}/${all} team-games · ${r.upcoming.length} games this week (${r.upcoming.filter((u) => u.homeLine != null).length} with a spread)`);
    // college: only keep FBS teams that played this season
    // sanity: favorites should win ~65-80% and cover ~50%, overs ~50%
    const gs = Object.values(r.teams).flatMap((t) => t.games).filter((g) => g.home && g.line != null && g.line !== 0);
    const favWin = gs.filter((g) => (g.line < 0) === (g.pf > g.pa)).length;
    const cover = gs.filter((g) => g.pf - g.pa + g.line > 0).length;
    const ou = gs.filter((g) => g.total != null && g.pf + g.pa !== g.total);
    const over = ou.filter((g) => g.pf + g.pa > g.total).length;
    console.log(`teams: ${lg} check · favorites won ${Math.round((100 * favWin) / gs.length)}% · home covered ${Math.round((100 * cover) / gs.length)}% · overs ${Math.round((100 * over) / Math.max(1, ou.length))}% (${gs.length} games)`);
    out.leagues[lg] = { week: r.week, teams: r.teams, upcoming: r.upcoming };
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`teams: wrote ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
}
main().catch((e) => { console.error("teams failed:", e); process.exitCode = 0; });
