# Decision log

Short records of the choices that shaped the build, including the ones I reversed.

---

## 001 — Deterministic email drafting, no model call

**Context.** The obvious "AI" version of this tool sends the job description to an LLM with a
"write a cold email" prompt.

**Decision.** Assemble the email from templates and facts extracted from the posting, plus one
portfolio repo the sender actually owns. No model in the path.

**Why.** A cold email is a claim about what you have done. A model that is 97% accurate still
fabricates in the remaining 3%, and the failure is invisible until a recruiter replies. Determinism
also makes the output testable and the cost exactly zero.

**Trade-off.** The writing is less varied than a good model. Accepted: truth beats fluency in the
one message that represents you.

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

**Decision.** Removed. The bot now produces a copy-paste packet and the human sends it.

**Why.** Two reasons. Sending from the bot's mailbox makes the message look automated and puts a
machine between you and a human on the first touch. And an approval listener that must stay running
on a laptop is a reliability trap: if the machine sleeps, the reply is lost silently.

**Consequence.** Approvals are simpler and more honest, at the cost of one manual step.

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
