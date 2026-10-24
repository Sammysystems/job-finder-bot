import type { Job } from "../types.js";
import type { ScoredJob } from "../score.js";
import { prepareEmailPacket } from "./approval.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendOutreachPackets(jobs: (Job | ScoredJob)[]): Promise<{ sent: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || jobs.length === 0) return { sent: 0 };

  let sent = 0;
  for (const job of jobs) {
    try {
      const { draft } = prepareEmailPacket(job as Job);
      const toEmail = (draft.toEmail || (job as Job).email || "").trim();
      
      let text = `📧 Email Draft\n`;
      text += `Role: ${escapeHtml(job.title)}\n`;
      text += `Company: ${escapeHtml(job.company || "Unknown")}\n`;
      if (toEmail) text += `To: ${escapeHtml(toEmail)}\n`;
      text += `Source: ${(job as Job).source || "unknown"}\n\n`;
      text += `Subject: ${escapeHtml(draft.subject)}\n\n`;
      text += `${escapeHtml(draft.body)}\n\n`;
      text += `🔗 Job Link: ${job.url}\n`;
      text += `\n— Copy & send manually via Gmail —`;
      
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      if (res.ok) sent++;
    } catch {
      // continue
    }
  }
  return { sent };
}
