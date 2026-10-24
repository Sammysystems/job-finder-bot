# Job Finder Bot

A $0/run personal job finder built for finding high-quality, remote **AI/automation/agent/integration** roles and running email-first cold outreach with human approval.

> **Rule:** No auto-submitting to ATS forms (Greenhouse/Lever/Workday/Ashby/Workable). Every email goes through explicit approval before sending.

## Overview

- **Purpose:** Deliver 2–5 relevant, mid-level remote AI/automation roles per day to Telegram with grounded cold emails ready for approval.
- **Focus:** AI automation / AI agents / LLM integrations / workflow automation. Prioritizes roles that actually use TypeScript/Node/React/Next.js where relevant.
- **Outreach:** Email-first cold outreach with a strict 3-paragraph style (problem-first opener, "This is where I come in" once, proposal + CTA asking for a short conversation), signed as **Samuel**.
- **Approval:** Text-based approvals in Telegram (LIST/SEND/EDIT/SKIP) with YES/NO confirmations. Only "View Job" button remains on packets.
- **Cost:** $0/run. Uses free job sources only. No n8n. Secrets in `.env` only.

## Architecture

```text
fetch (ashby, remotive, jobicy, arbeitnow, remoteok, weworkremotely, HN "Who's Hiring") 
  -> normalize 
  -> dedupe (seen-jobs.json) 
  -> eligibility (onsite/hybrid rejected, "everywhere" geography weighting)
  -> score/gate (strict AI/automation signals) 
  -> top matches (up to 10)
  -> Telegram brief + email packets (if direct email found)
```

## Key Features

- **Multi-source ingestion** - Ashby, Remotive, Jobicy, Arbeitnow, RemoteOK, WeWorkRemotely, and HackerNews "Ask HN: Who is hiring?" (HN Algolia parsing extracts emails/links)
- **Strict filtering** - Blocks SRE/DevOps/Infra/Data/ML/Mobile/Go/PHP/Ruby/Java/SAP/Design/GTM. Generic SWE only accepted with strong AI/automation signals
- **Grounded cold emails** - Drafted from the JD with repo-aware selection from `github-repos.json`. Matches your sample style exactly.
- **Email-first with Gmail** - Sends via Nodemailer + Gmail SMTP using an App Password. Configured via `profile/outreach.json`
- **Text-based approval system** - Reliable alternative to flaky Telegram callbacks. Enforces "one action = one draft", never mass-sends on bare `SEND`
- **Edit flow** - Edit drafts in-place via Telegram, parse SUBJECT/BODY or flexible formats
- **Application tracking** - All drafts tracked in `data/applications.json` with statuses: `drafted`, `edited`, `sent`, `skipped`, `failed`
- **Windows automation** - Runs daily via Task Scheduler (`JobFinderBot-Daily` at 07:00). Approval listener auto-starts via `JobFinderBot-Approvals`

## How It Runs

### Daily batch (07:00)
1. `run-daily.ps1` triggers the VoltAgent workflow
2. Fetches all sources, normalizes, deduplicates against `data/seen-jobs.json`
3. Filters and scores based on keywords/eligibility
4. Sends **one Telegram brief** + **email packets** for jobs with direct emails
5. All jobs come in **one batch** from that run (not spread throughout the day)

### Approvals (throughout the day)
The text listener `src/approval-listener-text.ts` must be running on the machine to handle approvals and actually send emails.

**Commands (reply in Telegram):**
```text
LIST                -> Show all pending drafts with numbers/IDs
SEND [#|ID]         -> Send a specific draft (asks YES/NO confirmation)
EDIT [#|ID]         -> Enter edit mode, paste updated email
SKIP [#|ID]         -> Skip a draft (asks YES/NO confirmation)
SHOW [#|ID]         -> View full subject/body
CANCEL / NO         -> Cancel current action/edit/confirmation
```

**Important:** If you have multiple pending and type `SEND` with no number, it will ask you to pick which one. It will **never** send all at once.

## Tracking Applications

All outreach state is tracked in `data/applications.json`:

```json
{
  "jobId": "...",
  "job": { "title": "...", "company": "...", "url": "...", "email": "..." },
  "draft": { "subject": "...", "body": "...", "toEmail": "..." },
  "status": "drafted|edited|sent|skipped|failed",
  "createdAt": "...",
  "sentAt": "...",
  "messageId": "..."
}
```

- `LIST` shows current pending (drafted/edited)
- When sent via Gmail, status becomes `sent` with `messageId` and `sentAt`
- Skipped items become `skipped` and won't be shown in pending

## Files & Structure

```text
src/
├── approval-listener-text.ts   # Text-based Telegram approval listener (must stay running)
├── run.ts                     # Manual run entry
├── config/keywords.ts         # Tightened AI/automation filters
├── outreach/
│   ├── applications.ts        # Application/draft tracking
│   ├── approval.ts            # Packet formatting
│   ├── draft-email.ts         # 3-paragraph cold email drafter
│   ├── edit-session.ts        # Edit + confirmation session state
│   ├── gmail-sender.ts        # Nodemailer Gmail SMTP sender
│   └── notify-outreach.ts     # Send packets to Telegram (View Job only)
├── signals/hn.source.ts       # HN "Who's Hiring" parser
└── workflows/job-finder.workflow.ts

data/                          # Runtime state (gitignored)
profile/outreach.json          # Sender profile, repos, priorities/avoids
.github-repos.json            # GitHub repos for grounding
.env                          # Secrets (gitignored)
run-daily.ps1                 # Daily scheduler script
```

## Laptop On/Off Behavior

- **Seeing jobs at 07:00**: The `JobFinderBot-Daily` task can wake the laptop if "Wake the computer to run this task" is enabled and on AC. It will send packets to Telegram regardless of you using the laptop.
- **Approving & sending emails**: **Requires the laptop to be ON with `approval-listener-text.ts` running.** If it's off/asleep/hibernating, replies won't be processed and emails won't send. 
- **Current setup**: Listener is auto-started via Task Scheduler at logon and started now. For lid-closed operation, set "Close lid action" to "Do nothing" on AC and keep plugged in.

**Note:** If laptop is off, you can still see packets in Telegram and manually copy the email (subject + body + recipient) and send it via Gmail yourself. The packets already include the grounded cold email and recipient.

## Setup

### Prerequisites
- Node.js 20+
- Telegram bot + chat ID
- Gmail account with App Password
- Windows with Task Scheduler

### Environment
Copy `.env.example` to `.env` and fill:
```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### Install & run
```bash
npm install
npm run build
npm run dev  # manual run
```

### Schedule
`JobFinderBot-Daily` runs `run-daily.ps1` at 07:00. `JobFinderBot-Approvals` starts the text listener at logon.

## Repo
**GitHub:** [github.com/Sammysystems/job-finder-bot](https://github.com/Sammysystems/job-finder-bot) (private)

## Notes
- Strictly email-first. Link-only roles show an "Apply Packet" style context but we don't auto-apply.
- Focus stays true to AI/automation/agent/integration work. Filters are aggressive by design to avoid noise.
- All approvals are manual and intentional. The flow is built to keep you in control. 
