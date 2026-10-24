import type { Job } from "../types.js";
import type { ScoredJob } from "../score.js";
import { prepareEmailPacket, formatEmailPacketForTelegram } from "./approval.js";

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
      const { draft, toEmail } = prepareEmailPacket(job as Job);
      let text = formatEmailPacketForTelegram(job as Job, draft, toEmail || (job as Job).email);
      text += `\n\n<i>Reply LIST to manage this draft via text.</i>`;
      const keyboard = {
        inline_keyboard: [
          [{ text: "🔗 View Job", url: job.url }],
        ],
      };
      
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: keyboard,
        }),
      });
      if (res.ok) sent++;
    } catch {
      // continue
    }
  }
  return { sent };
}
