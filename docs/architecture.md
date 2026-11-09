# Architecture

## Pipeline

```
run.ts
  └─ job-finder.workflow.ts (VoltAgent)
       ├─ fetch-jobs.tool      -> clients/registry.ts -> 7 source adapters
       ├─ filter-jobs.tool     -> dedupe.ts -> score.ts -> eligibility.ts
       ├─ save-jobs.tool       -> data/seen-jobs.json, data/applications.json
       └─ notify.tool          -> notify-outreach.ts -> Telegram
```

The workflow is a straight line with one side effect at each end: fetch, filter, persist, notify.
No scheduler inside the process — the schedule is external (Actions cron or Task Scheduler), which
keeps a run fast and re-runnable.

## Source adapters

`src/clients/*.source.ts` each export a `JobSource`:

```ts
interface JobSource {
  id: string;
  fetch(): Promise<Job[]>;
}
```

Each adapter is responsible only for the board's payload shape. Everything shared happens after:
`normalizeJob()` assigns a namespaced id, canonicalizes the URL, strips HTML, caps the description,
and derives `remote`. A malformed listing returns `null` and is dropped; an adapter throwing is
caught at the registry so one dead feed cannot fail the run.

`src/signals/hn.source.ts` is different: Hacker News "Who is hiring?" is prose, not JSON fields.
It finds the latest thread through the Algolia API, keeps only top-level comments
(`parent_id === threadId`), heuristically parses the header line
(`Company | Role | REMOTE (EU) | Full-time | $120k–$160k`), and extracts a contact email when one
is present. That is the only source that yields direct addresses.

The default registry includes only sources with useful marketing-role coverage and enough listing
text to evaluate responsibilities:

| Source | Query or category | Reason |
| --- | --- | --- |
| Remotive | Public RSS feed | Replaces the legacy search API, which returned the same programming-heavy results for unrelated search terms |
| Jobicy | `marketing` and `creative` tags | Returns full descriptions from relevant job categories |
| Arbeitnow | Recent broad-job pages | Broad feed with full descriptions; strict title and evidence gates reject unrelated roles |
| We Work Remotely | Sales/marketing and design RSS categories | Includes marketing and creative-strategy listings with descriptions |
| Hacker News | Latest "Who is hiring?" thread | Broad monthly hiring posts with full text and occasional contact details |

Remote OK and Ashby remain opt-in, but are excluded from normal runs: Remote OK is a broad feed
without a marketing category, while the current Ashby adapter reads only configured boards and
doesn't fetch full job descriptions. That is the only source that yields direct addresses.

## Filtering

Three gates run before anything is scored, in order — each is a hard reject:

1. **Target title** — the title must identify a Creative Strategist, Copywriter, Email/Lifecycle
   Marketing, or Content Strategist role. Generic engineering, AI research, and unrelated marketing
   titles are rejected.
2. **Role proof** — the description must match at least two distinct responsibility groups for the
   detected role family. Generic terms such as "API", "AI", or "SaaS" do not count as role evidence.
3. **Geography** — onsite, hybrid, and country-locked remote roles are rejected.

Only after all gates pass does scoring consider evidence breadth, freshness, seniority, salary, and
eligibility. Each result includes the role family and matched evidence terms so the shortlist explains
why it passed. `rankAndSelect()` sorts by score and caps each company at two roles.

## Eligibility

Eligibility is a separate, narrower judgment than "is it remote":

| tier | meaning | weight |
| --- | --- | --- |
| worldwide, africa | workable from anywhere | 4 |
| open | remote, no region named | 3 |
| emea | Europe/Middle East/Africa | 2 |
| apac, latam | regional | 1.5 |
| usa | US/Canada only | 1 |
| onsite | not remote | rejected |

A US-only remote role and a worldwide remote role are both "remote", but they are not equally
winnable from Lagos. The brief ranks them differently instead of hiding either.

## Dedupe

Two layers:

- **Exact** — canonical URL, or a normalized `company|title` key checked against the persistent
  seen-set.
- **Fuzzy** — Levenshtein similarity on company (> 0.9) and title (> 0.85) against jobs already
  added this run.

The persistent set is written after a successful run, so a role is announced once even if several
feeds carry it.

## Delivery

`notify-outreach.ts` formats one plain-text application draft per role. Drafts quote relevant wording
from the job description and leave candidate evidence as placeholders unless configured. They are
designed to be reviewed, copied, and submitted by the candidate. No email sender or ATS submission
path is available.

## Failure model

| Failure | Behaviour |
| --- | --- |
| One source throws or times out | Logged, source skipped, run continues |
| Telegram unreachable | Logged; the run still persists its state |
| Board returns a new payload shape | That adapter yields zero jobs; others unaffected |
| Duplicate run on the same day | Dedupe catches repeat listings; state prevents re-announcing |

## Deliberate limits

- **No database.** Two JSON files are enough for one user and keep the CI runner stateless between runs.
- **No LLM in the application-draft path.** Determinism was chosen over fluency (see `decisions.md`).
- **No auto-apply.** ATS forms are the one place where an automated action has real, irreversible cost.
