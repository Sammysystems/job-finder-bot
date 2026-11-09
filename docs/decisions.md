# Decision log

Short records of the choices that shaped the build, including the ones I reversed.

---

## 001 — Deterministic application drafts, no model call

**Context.** The obvious "AI" version of this tool sends the job description to an LLM with a
"write an application" prompt.

**Decision.** Quote relevant evidence from the posting and leave candidate experience and work
samples as explicit placeholders until the user configures them. No model in the path.

**Why.** An application is a claim about what the candidate has done. The bot must not invent
experience, metrics, or portfolio relevance. Determinism also makes the output testable.

**Trade-off.** The user must complete the draft with their own evidence. Accepted: truth beats
fluency in a message that represents the candidate.

---

## 002 — Default-deny geography

**Context.** Early runs surfaced roles labelled "Remote" that were remote within one country.

**Decision.** A location passes only if it is an explicit open region, empty, or contains nothing but
remote words. Any residual place name rejects the role. Titles are scanned for restrictions too.

**Why.** The cost of a false positive is high: you read the brief, get interested, then discover you
are ineligible. The cost of a false negative is low — the role was not winnable anyway.

**Trade-off.** Some genuinely global roles with unusual phrasing are dropped. Tunable in
`src/config/keywords.ts`.

---

## 003 — Rank country-locked roles instead of hiding them

**Context.** A US-only remote role may still be worth applying to, just not at the same priority as
a worldwide one.

**Decision.** Keep them, but weight them lower (`eligibility.ts`), and let the brief show the tier.

**Why.** Hiding them loses information; showing them equally wastes attention. Ranking preserves both.

---

## 004 — Remove the auto-send path

**Context.** The first version could send email from the bot after a Telegram approval.

**Decision.** The bot produces a copy-paste packet only. Email sending and ATS submission are
disabled; the human reviews and submits.

**Why.** Two reasons. Sending from the bot's mailbox makes the message look automated and puts a
machine between you and a human on the first touch. And an approval listener that must stay running
on a laptop is a reliability trap: if the machine sleeps, the reply is lost silently.

**Consequence.** There is no irreversible application side effect in the bot, at the cost of a manual step.

---

## 005 — No ATS auto-apply, permanently

**Decision.** No adapter submits to Greenhouse, Lever, Workday, Ashby, or Workable.

**Why.** Form-filling bots misfire on real applications, and the damage is not recoverable. The value
of this tool is *finding* and *preparing*, not submitting.

---

## 006 — JSON files instead of a database

**Context.** A hosted Postgres was available.

**Decision.** Two JSON files on disk.

**Why.** One user, low volume, and a hard requirement that the daily run works on a free CI runner
with no infrastructure. A database would add a credential, a network dependency, and a failure mode
for no benefit at this scale.

**Known cost.** State is per-machine: a CI run and a laptop run do not share the seen-set. Documented
rather than hidden.

---

## 007 — Deterministic tests around the gates, not the adapters

**Decision.** Tests target normalization, geography, scoring, dedupe, and HN parsing — not live HTTP.

**Why.** Adapters change shape constantly and are covered by a live smoke script
(`npm run test:fetch`). The gates encode judgment calls, which are exactly the things that should not
silently regress.

---

## 008 — Require role-specific evidence before ranking

**Context.** Prior digests repeatedly ranked general software-engineering roles for an AI-automation
search because generic words in a description counted as proof of role fit.

**Decision.** Require a title in one of the configured target families and evidence from at least two
distinct responsibility groups in that family's description. Apply recency and other ranking
bonuses only after role and location gates pass.

**Trade-off.** This favors precision over volume; unusual but relevant postings may be missed. Measure
precision against manually reviewed results before relaxing any gate.

---

## 009 — Curate default sources for the target role families

**Context.** The previous defaults used an Ashby company list and technical search terms. Remotive's
legacy search endpoint returned the same programming-heavy results for unrelated queries, and the
We Work Remotely adapter read its programming category.

**Decision.** Use Remotive's public RSS feed, Jobicy's marketing and creative tags, Arbeitnow's
recent-job feed, We Work Remotely's sales/marketing and design feeds, and Hacker News hiring posts
by default. Keep Remote OK and Ashby as explicit opt-ins.

**Why.** The selected sources have live evidence of marketing, writing, or creative listings and
provide posting text for the role-evidence gate. The default must not route primarily through
technical-only feeds.

**Trade-off.** Public feeds are limited and may not include every suitable vacancy. Measure live
coverage and precision rather than implying exhaustive discovery.

---

## 010 — Add bounded adjacent marketing role families

**Context.** The first live source run found only a small number of exact-title Creative Strategist,
Copywriter, and Email Marketing Strategist matches.

**Decision.** Add Content Strategist and Lifecycle Marketing title variants, while keeping each
family gated by evidence from at least two distinct responsibility groups. Growth Copywriter remains
within the Copywriter family.

**Why.** These adjacent titles describe overlapping work without accepting generic marketing roles
based on broad keywords alone.

**Trade-off.** This may improve recall but does not guarantee two to five eligible jobs every day;
source yield and geography still limit supply.
