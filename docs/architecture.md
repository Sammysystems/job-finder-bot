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

## Filtering

Three gates run before anything is scored, in order — each is a hard reject:

1. **Title exclusion** — SRE, DevOps, infra, data, ML research, mobile, Go/PHP/Ruby/Java/SAP, design,
   GTM and similar roles are out regardless of description.
2. **Role proof** — either the title names AI/automation work, or the title is a general engineering
   title *and* the description contains AI/automation signals. Nothing else survives.
3. **Geography** — onsite and hybrid are rejected; country-locked remote roles are rejected.

Only then does scoring add weight for role match, description signals, freshness, seniority, salary
presence, eligibility tier, and known target companies. `rankAndSelect()` sorts by score, breaks ties
by freshness, and caps each company at two roles.

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

`notify-outreach.ts` formats one plain-text packet per role. There are no inline buttons: the packet
is designed to be read, copied, and sent from a phone. Credentials are never required for this path.

The optional Gmail sender (`src/outreach/gmail-sender.ts`) reads credentials from environment
variables first and only falls back to the local profile. It exists for convenience, not for
automation — nothing calls it without a human action.

## Failure model

| Failure | Behaviour |
| --- | --- |
| One source throws or times out | Logged, source skipped, run continues |
| Telegram unreachable | Logged; the run still persists its state |
| Board returns a new payload shape | That adapter yields zero jobs; others unaffected |
| Duplicate run on the same day | Dedupe catches repeat listings; state prevents re-announcing |

## Deliberate limits

- **No database.** Two JSON files are enough for one user and keep the CI runner stateless between runs.
- **No LLM in the email path.** Determinism was chosen over fluency (see `decisions.md`).
- **No auto-apply.** ATS forms are the one place where an automated action has real, irreversible cost.
