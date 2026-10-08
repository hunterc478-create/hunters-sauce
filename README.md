# Hunter's Sportsbook

NFL odds, best prices across the sportsbooks, value bets, player props and teasers.
**Not a sportsbook: no bets are taken here.** Live at `https://instanthunter-11.github.io/hunters-sportsbook/`.

Built with Next.js 15 (static export), TypeScript and Tailwind, hosted free on GitHub Pages. GitHub Actions rebuilds
the data and the site about every 30 minutes (`.github/workflows/deploy.yml`).

## Pages

| Page | What it shows |
|---|---|
| This Week | The NFL week by broadcast slot (TNF, Sunday 1:00, late afternoon, SNF, MNF) as game tiles |
| Game page | Every game: best price per side, every book's price, fair price, teaser legs, props, anytime TD, injuries, weather |
| Best Bets | Bets where a book pays more than the consensus fair price, plus locks |
| Props | Sportsbook player props priced against the books' consensus, plus anytime-TD chances |
| Teasers | 6-point teaser legs with how often similar games covered since 2010, and the strongest 2- and 3-team teasers |
| Locks, Parlays, My Bets, Record | Same as Edge Analytics: likeliest fair bets, parlay builder and slip, your own bets (auto-settled), the graded track record |

## How picks work

- **Fair price:** the no-vig price at every book that prices both sides, median across books; 3+ books required.
- **Value bet:** a book beating that fair price by 1+ point (spreads, totals, moneylines) or 2+ points (props).
  Stale-looking prices 3+ points off the consensus are dropped; nothing past +250.
- **Teasers:** each side's main spread moved 6 points, scored by real NFL results since 2010 for games with a similar
  line (nflverse). Break-even per leg: 73.9% for a 2-team teaser at -120, 72.7% for a 3-team at +160.
- **Our stats model** (team strength, injuries, rest, weather) is shown as a lean only. Anytime-TD chances come from our
  player model and are shown as fair prices, never as "value".

## Data and the API key

Games, lines and scores come free from ESPN and Action Network (~10 books), plus Kalshi. Player props come from
The Odds API (`THE_ODDS_API_KEY` repo secret, free tier 500 credits/month): 5 markets per game (passing yards and
TDs, rushing yards, receiving yards, receptions), each game pulled once at 9 AM Central the day before or the day of
kickoff, about 80 credits a week. Actions > Run workflow > "Load player props now" refreshes every game in the window.

Optional secret `NTFY_TOPIC` turns on phone alerts for locks (ntfy app).

## Responsible use

Prices are estimates and move fast; check the book before betting. Even real edges lose often. Bet only what you can
afford to lose. If gambling stops being fun, call or text 1-800-GAMBLER.
