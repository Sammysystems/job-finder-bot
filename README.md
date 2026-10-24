# Job Finder Bot

Personal job monitor. Pulls remote listings from six free feeds, keeps the roles that
match an automation/AI/full-stack profile, ranks them, and sends one Telegram brief a day.

TypeScript + VoltAgent + Zod. Runs locally on a Windows scheduled task, or on a free
GitHub Actions cron if the laptop is off.

## What a run does

```
fetch (6 sources) -> normalize -> dedupe (fuzzy + seen store) -> gate + score -> top 10 -> Telegram brief
```

Last verified run:

```
Fetched:   1274
Matched:   10
New:       10
Notified:  1        (one brief message)
Sources:   ashby:lemfi, ashby:supabase, remotive, jobicy, arbeitnow, remoteok, wwr
```

## Sources

| Source | Access | Notes |
| --- | --- | --- |
| Ashby | Hidden GraphQL, public | `POST /api/non-user-graphql?op=ApiJobBoardWithTeams`, orgs from `ASHBY_ORGS` |
| Remotive | Public API | `?search=` per query, 200 max |
| Jobicy | Public API | `?tag=`, 50 max per tag |
| Arbeitnow | Public API | 300/page, paginated by age; stops after `ARBEITNOW_MAX_PAGES` |
| RemoteOK | Public API | 100 rows, element 0 is a legal notice and is skipped |
| We Work Remotely | Public RSS | 25 items, titles are "Company: Role" |

Attribution: RemoteOK and Arbeitnow both ask for a link back — stored URLs are the
original job pages, and `source` is preserved on every record.

## Selectivity

Two layers, in this order:

1. **Hard gates** (`src/score.ts`) — drop the job entirely when:
   - the title matches a non-engineering pattern (sales, marketing, support, product
     manager, designer, director, manager, intern, fresh graduate)
   - no strong title keyword matches (automation, AI, LLM, agent, integration, API,
     TypeScript, Node, React, full stack, frontend, backend, software engineer, developer)
   - the location is not open: `worldwide`, `anywhere`, `global`, `africa`, `nigeria`,
     `emea`, empty, or nothing but remote words. Any leftover place name means the role
     is country-locked, so it is dropped. Titles are checked too ("Remote from EU").
2. **Weighted score** — title hits (3 each), supporting skills (1 each), remote (+3),
   freshness (today +3 … older than 14 days −2), seniority (+1, junior −3), salary (+1),
   target company (+1).

Top 10 by score, then freshness. No more than two roles per company.

## Setup

```bash
npm install
cp .env.example .env
```

| Var | Purpose |
| --- | --- |
| `JOB_SOURCE` | `ashby` shortcut or `stub` for offline fixtures |
| `JOB_SOURCES` | Comma list to enable a subset; empty = all six |
| `ASHBY_ORGS` | Comma-separated Ashby org slugs |
| `ARBEITNOW_MAX_AGE_DAYS` / `ARBEITNOW_MAX_PAGES` | Crawl window (default 7 / 3) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Alerts; omit to run log-only |
| `CHROME_PATH` | Chromium binary for `scripts/capture.ts` |

## Commands

```bash
npm run dev          # full pipeline, sends the brief
npm run test:fetch   # per-source count table
npm run build        # typecheck
npx tsx scripts/capture.ts <url>   # record a page's XHR/fetch traffic
```

## Scheduling

`run-daily.ps1` runs the pipeline, appends to `logs/run-YYYY-MM-DD.log`, keeps 30 days,
and exits with the pipeline's code.

Task Scheduler entry `JobFinderBot-Daily` runs it daily at 07:00 with
`StartWhenAvailable` (missed runs fire when the machine wakes) and `WakeToRun`.

A laptop that is fully off cannot run a local task. For that, use a free GitHub Actions
cron workflow (private repo, `TELEGRAM_*` as secrets) or an always-on host.

## Structure

```
src/
  clients/               # one JobSource per feed + registry + shared http
  tools/                 # fetch, filter, save, notify
  workflows/             # VoltAgent createWorkflowChain pipeline
  config/keywords.ts     # title keywords, exclusions, geography rules
  normalize.ts           # HTML strip, mojibake repair, URL + remote normalisation
  dedupe.ts              # fuzzy company+title matching
  score.ts               # hard gates + weighted ranking
  db/                    # JSON store + dedupe helpers
scripts/capture.ts       # Playwright traffic capture
scripts/test-fetch.ts
run-daily.ps1            # scheduled entry point
data/seen-jobs.json      # delete to reset dedupe
captures/                # raw network captures (gitignored)
```

## Guardrails

- Public listings only; no auth bypass, no paywall circumvention
- No proxy rotation or block evasion
- Sequential requests with a 250ms gap; Arbeitnow capped by age and pages
- Secrets live in `.env` only, which is gitignored
