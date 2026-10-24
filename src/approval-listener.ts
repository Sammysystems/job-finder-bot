import "dotenv/config";
import { handleApprovalCallback } from "./outreach/approval.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}

let offset = 0;
console.log("Approval listener started for RentchaserBot...");

async function answerCallback(id: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: id, text, show_alert: false }),
    });
  } catch {}
}

async function sendMsg(chat: string | number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
  } catch {}
}

async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=30&offset=${offset}`, {
      method: "GET",
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return;
    
    for (const update of data.result) {
      offset = update.update_id + 1;
      if (update.callback_query) {
        const cq = update.callback_query;
        const cbData = cq.data || "";
        const cbChatId = cq.message?.chat?.id || chatId;
        const resCb = await handleApprovalCallback(cbData, cbChatId);
        await answerCallback(cq.id, resCb.ok ? (resCb.text || "Done") : (resCb.error || "Error"));
        if (resCb.ok && resCb.text) await sendMsg(cbChatId, resCb.text);
        else if (!resCb.ok && resCb.error) await sendMsg(cbChatId, "❌ " + resCb.error);
      }
    }
  } catch (e) {
    // ignore
  }
}

setInterval(poll, 500);
poll();
