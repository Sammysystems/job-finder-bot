import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { Job } from "../types.js";
import { loadSeenJobs, saveSeenJobs, markJobNotified } from "../db/index.js";
import type { ScoredJob } from "../score.js";
import { sendOutreachPackets } from "../outreach/notify-outreach.js";

export interface NotifyResult {
  attempted: number;
  sent: number;
  skipped: boolean;
  reason?: string;
  outreachSent?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatJobLine(job: ScoredJob, index: number): string {
  const title = escapeHtml(job.title);
  const company = job.company ? escapeHtml(job.company) : "Unknown";
  const location = job.location ? escapeHtml(job.location) : "Remote";
  const score = job.score ? ` [${job.score}]` : "";
  
  return `${index + 1}. <b>${title}</b>${score}\n   ${company} • ${location}\n   <a href="${escapeHtml(job.url)}">Apply →</a>`;
}

function formatBrief(jobs: ScoredJob[]): string {
  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [];
  
  lines.push(`<b>🎯 Job Finder Bot - ${date}</b>`);
  lines.push(`<i>${jobs.length} top match${jobs.length === 1 ? "" : "es"}</i>`);
  lines.push("");
  
  for (let i = 0; i < jobs.length; i++) {
    lines.push(formatJobLine(jobs[i], i));
    lines.push("");
  }
  
  lines.push(`<i>Powered by free job feeds • No auto-apply</i>`);
  
  return lines.join("\n");
}

function buildInlineKeyboard(jobs: ScoredJob[]) {
  const buttons = jobs.map((job, idx) => ({
    text: `${idx + 1}. Apply`,
    url: job.url,
  }));
  
  // Group in rows of 2
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  
  return { inline_keyboard: rows };
}

export async function notifyJobs(jobs: Job[]): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (jobs.length === 0) {
    return { attempted: 0, sent: 0, skipped: true, reason: "no new matches" };
  }
  if (!token || !chatId) {
    return {
      attempted: jobs.length,
      sent: 0,
      skipped: true,
      reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set",
    };
  }

  let sent = 0;
  const scoredJobs = jobs as ScoredJob[];
  
  try {
    // Send one compact brief with inline buttons
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatBrief(scoredJobs),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildInlineKeyboard(scoredJobs),
      }),
    });
    
    if (res.ok) {
      sent = 1; // Sent as one message
    }
  } catch {
    // Fallback to individual messages
    for (const job of scoredJobs) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `${escapeHtml(job.title)}\n${job.company ? escapeHtml(job.company) + "\n" : ""}${job.url}`,
            disable_web_page_preview: true,
          }),
        });
        if (res.ok) sent++;
      } catch {
        // continue
      }
    }
  }

    // Send outreach/email approval packets for jobs with emails (HN etc)
    let outreachSent = 0;
    try {
      const out = await sendOutreachPackets(scoredJobs);
      outreachSent = out.sent;
    } catch {
      // ignore
    }

    if (sent > 0) {
      const store = loadSeenJobs();
      for (const job of jobs) markJobNotified(job, store);
      saveSeenJobs(store);
    }

    return { attempted: jobs.length, sent, skipped: false, outreachSent };
  }

const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string().optional(),
  location: z.string().optional(),
  url: z.string(),
  description: z.string().optional(),
  postedAt: z.string().optional(),
  source: z.string(),
  remote: z.boolean().optional(),
  salary: z.string().optional(),
  matchedTerms: z.array(z.string()).optional(),
  score: z.number().optional(),
  reasons: z.array(z.string()).optional(),
});

export const notifyTool = createTool({
  name: "notify_jobs",
  description: "Send new matched jobs to Telegram as a ranked brief with apply buttons.",
  parameters: z.object({ jobs: z.array(jobSchema) }),
  execute: async ({ jobs }) => {
    const result = await notifyJobs(jobs);
    return { success: !result.skipped, ...result };
  },
});
