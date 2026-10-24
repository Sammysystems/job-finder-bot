import "dotenv/config";
import { getAllApps, markSent, markSkipped, markEdited, getApp } from "./outreach/applications.js";
import { sendGmail } from "./outreach/gmail-sender.js";
import {
  loadEditSession,
  startEditSession,
  clearEditSession,
  isInEditMode,
  loadConfirmSession,
  startConfirmSession,
  clearConfirmSession,
  hasPendingConfirm,
} from "./outreach/edit-session.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}

let offset = 0;
console.log("Approval text listener started (text-only)...");

async function sendMsg(chat: string | number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
  } catch {}
}

function getPending() {
  return getAllApps().filter(a => a.status === "drafted" || a.status === "edited");
}

function resolveAppByRef(ref: string) {
  const pending = getPending();
  if (!ref) return pending[0] || null;
  const r = ref.trim().toLowerCase();
  // by number
  const num = parseInt(r);
  if (!isNaN(num) && num >= 1 && num <= pending.length) {
    return pending[num - 1];
  }
  // by id
  const found = pending.find(a => a.jobId.toLowerCase() === r || r.includes(a.jobId.toLowerCase()));
  return found || pending[0] || null;
}

function parseEditedEmail(text: string): { subject: string; body: string } | null {
  const upper = text.toUpperCase();
  const subjIdx = upper.indexOf("SUBJECT:");
  const bodyIdx = upper.indexOf("BODY:");
  if (subjIdx !== -1) {
    let subject = "";
    let body = text;
    if (bodyIdx !== -1 && bodyIdx > subjIdx) {
      subject = text.slice(subjIdx + 8, bodyIdx).trim().replace(/^\r?\n+/, "").replace(/\r?\n+$/, "");
      body = text.slice(bodyIdx + 5).trim();
    } else {
      // subject until first blank line
      const after = text.slice(subjIdx + 8);
      const m = after.match(/^\s*([^\r\n]+)\s*\r?\n([\s\S]+)$/);
      if (m) {
        subject = m[1].trim();
        body = m[2].trim();
      } else {
        return null;
      }
    }
    if (!subject || !body) return null;
    return { subject, body };
  }
  // fallback: first line as subject, rest as body
  const m = text.match(/^\s*([^\r\n]+)\s*\r?\n\r?\n?([\s\S]+)$/);
  if (m && m[1].length < 120) {
    return { subject: m[1].trim(), body: m[2].trim() };
  }
  return null;
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
      if (update.message?.text) {
        const rawText = update.message.text;
        const textLower = rawText.trim().toLowerCase();
        const fromChat = update.message.chat.id;
        if (chatId && fromChat.toString() !== chatId.toString()) continue;

        // Handle confirmation YES/NO
        if (hasPendingConfirm(fromChat)) {
          const conf = loadConfirmSession();
          if (textLower === "yes" || textLower === "y") {
            if (conf.action === "send" && conf.jobId) {
              const app = getApp(conf.jobId);
              if (!app) {
                clearConfirmSession();
                await sendMsg(fromChat, "Draft not found.");
                continue;
              }
              const to = app.draft.toEmail || app.job.email;
              if (!to) {
                clearConfirmSession();
                await sendMsg(fromChat, "No recipient email on this job.");
                continue;
              }
              const resSend = await sendGmail({ to, subject: app.draft.subject, text: app.draft.body });
              if (resSend.ok) {
                markSent(conf.jobId, resSend.messageId);
                clearConfirmSession();
                await sendMsg(fromChat, `SENT ✓\n\nJob: ${app.job.title} @ ${app.job.company || "Unknown"}\nTo: ${to}\nSubject: ${app.draft.subject}\nMessage ID: ${resSend.messageId || "sent"}\n\nPending: ${getPending().length} left. Reply LIST to see.`);
              } else {
                clearConfirmSession();
                await sendMsg(fromChat, `Failed to send: ${resSend.error}`);
              }
              continue;
            } else if (conf.action === "skip" && conf.jobId) {
              const app = getApp(conf.jobId);
              markSkipped(conf.jobId);
              clearConfirmSession();
              await sendMsg(fromChat, `SKIPPED ✓\n\n${app?.job.title || conf.jobId} @ ${app?.job.company || ""} skipped.\n\nPending: ${getPending().length} left. Reply LIST to see.`);
              continue;
            }
          } else if (textLower === "no" || textLower === "n" || textLower === "cancel") {
            clearConfirmSession();
            await sendMsg(fromChat, "Cancelled.");
            continue;
          }
          // If not yes/no, remind
          await sendMsg(fromChat, "Reply YES to confirm or NO to cancel.");
          continue;
        }

        // Handle edit mode
        if (isInEditMode(fromChat)) {
          if (textLower === "cancel" || textLower === "exit") {
            clearEditSession();
            await sendMsg(fromChat, "Edit mode cancelled.");
            continue;
          }
          const session = loadEditSession();
          if (!session.jobId) {
            clearEditSession();
            await sendMsg(fromChat, "Edit session error. Cancelled.");
            continue;
          }
          const parsed = parseEditedEmail(rawText.trim());
          if (!parsed) {
            await sendMsg(fromChat, "Could not parse. Reply like:\nSUBJECT: ...\n\nBODY:\n...\n\nOr paste full email (first line = subject). Reply CANCEL to exit.");
            continue;
          }
          markEdited(session.jobId, parsed);
          clearEditSession();
          const app = getApp(session.jobId);
          await sendMsg(fromChat, `EDIT SAVED ✓\n\nUpdated for ${app?.job.title || session.jobId} @ ${app?.job.company || ""}\nStatus: edited\n\nType SEND to send it, or LIST to see all.`);
          continue;
        }

        // Commands
        if (textLower === "list" || textLower === "pending") {
          clearEditSession();
          clearConfirmSession();
          const pending = getPending();
          if (pending.length === 0) {
            await sendMsg(fromChat, "JOB FINDER | PENDING (0)\n\nNo pending drafts.");
            continue;
          }
          const lines = pending.map((a,i) => `[${i+1}] ${a.job.title} @ ${a.job.company || "Unknown"}\n    To: ${a.draft.toEmail || a.job.email || "?"}\n    ID: ${a.jobId}\n    Status: ${a.status}`).join("\n\n");
          await sendMsg(fromChat, `JOB FINDER | PENDING (${pending.length})\n\n${lines}\n\nReply: SEND [#|ID] | EDIT [#|ID] | SKIP [#|ID] | SHOW [#|ID]`);
          continue;
        }

        if (textLower === "show") {
          clearEditSession();
          clearConfirmSession();
          const pending = getPending();
          if (pending.length === 0) { await sendMsg(fromChat, "No pending drafts."); continue; }
          if (pending.length >= 2) {
            await sendMsg(fromChat, "Which one?\n\n" + pending.map((a,i)=>`[${i+1}] ${a.job.title} @ ${a.job.company} (${a.jobId})`).join("\n") + "\n\nReply: SHOW 1 or SHOW hn:xxx");
            continue;
          }
          const app = pending[0];
          await sendMsg(fromChat, `SHOW | ${app.jobId}\nJob: ${app.job.title} @ ${app.job.company || "Unknown"}\nTo: ${app.draft.toEmail || app.job.email || "?"}\n\nSUBJECT:\n${app.draft.subject}\n\nBODY:\n${app.draft.body}`);
          continue;
        }

        if (textLower.startsWith("show ")) {
          clearEditSession();
          clearConfirmSession();
          const ref = rawText.trim().slice(5).trim();
          const app = resolveAppByRef(ref);
          if (!app) { await sendMsg(fromChat, "Not found."); continue; }
          await sendMsg(fromChat, `SHOW | ${app.jobId}\nJob: ${app.job.title} @ ${app.job.company || "Unknown"}\nTo: ${app.draft.toEmail || app.job.email || "?"}\n\nSUBJECT:\n${app.draft.subject}\n\nBODY:\n${app.draft.body}`);
          continue;
        }

        if (textLower === "send") {
          clearEditSession();
          const pending = getPending();
          if (pending.length === 0) { await sendMsg(fromChat, "No pending drafts. Reply LIST to see."); continue; }
          if (pending.length >= 2) {
            await sendMsg(fromChat, "Which one do you want to send?\n\n" + pending.map((a,i)=>`[${i+1}] ${a.job.title} @ ${a.job.company} (${a.jobId})`).join("\n") + "\n\nReply: SEND 1 or SEND hn:xxx");
            continue;
          }
          const app = pending[0];
          startConfirmSession("send", app.jobId, fromChat);
          await sendMsg(fromChat, `SEND CONFIRMATION\n\nJob: ${app.job.title} @ ${app.job.company || "Unknown"}\nTo: ${app.draft.toEmail || app.job.email || "?"}\nSubject: ${app.draft.subject}\n\nReply YES to send or NO to cancel`);
          continue;
        }

        if (textLower.startsWith("send ")) {
          clearEditSession();
          const ref = rawText.trim().slice(5).trim();
          const app = resolveAppByRef(ref);
          if (!app) { await sendMsg(fromChat, "Not found. Reply LIST to see pending."); continue; }
          startConfirmSession("send", app.jobId, fromChat);
          await sendMsg(fromChat, `SEND CONFIRMATION\n\nJob: ${app.job.title} @ ${app.job.company || "Unknown"}\nTo: ${app.draft.toEmail || app.job.email || "?"}\nSubject: ${app.draft.subject}\n\nReply YES to send or NO to cancel`);
          continue;
        }

        if (textLower === "skip") {
          clearEditSession();
          const pending = getPending();
          if (pending.length === 0) { await sendMsg(fromChat, "No pending drafts. Reply LIST to see."); continue; }
          if (pending.length >= 2) {
            await sendMsg(fromChat, "Which one do you want to skip?\n\n" + pending.map((a,i)=>`[${i+1}] ${a.job.title} @ ${a.job.company} (${a.jobId})`).join("\n") + "\n\nReply: SKIP 1 or SKIP hn:xxx");
            continue;
          }
          const app = pending[0];
          startConfirmSession("skip", app.jobId, fromChat);
          await sendMsg(fromChat, `SKIP CONFIRMATION\n\nSkip ${app.job.title} @ ${app.job.company || "Unknown"} (${app.jobId})?\nTo: ${app.draft.toEmail || app.job.email || "?"}\n\nReply YES to skip or NO to cancel`);
          continue;
        }

        if (textLower.startsWith("skip ")) {
          clearEditSession();
          const ref = rawText.trim().slice(5).trim();
          const app = resolveAppByRef(ref);
          if (!app) { await sendMsg(fromChat, "Not found. Reply LIST to see pending."); continue; }
          startConfirmSession("skip", app.jobId, fromChat);
          await sendMsg(fromChat, `SKIP CONFIRMATION\n\nSkip ${app.job.title} @ ${app.job.company || "Unknown"} (${app.jobId})?\nTo: ${app.draft.toEmail || app.job.email || "?"}\n\nReply YES to skip or NO to cancel`);
          continue;
        }

        if (textLower === "edit") {
          clearConfirmSession();
          const pending = getPending();
          if (pending.length === 0) { await sendMsg(fromChat, "No pending drafts. Reply LIST to see."); continue; }
          if (pending.length >= 2) {
            await sendMsg(fromChat, "Which one do you want to edit?\n\n" + pending.map((a,i)=>`[${i+1}] ${a.job.title} @ ${a.job.company} (${a.jobId})`).join("\n") + "\n\nReply: EDIT 1 or EDIT hn:xxx");
            continue;
          }
          const app = pending[0];
          startEditSession(app.jobId, fromChat);
          await sendMsg(fromChat, `EDIT MODE | ${app.jobId}\nJob: ${app.job.title} @ ${app.job.company || "Unknown"}\nTo: ${app.draft.toEmail || app.job.email || "?"}\n\nCURRENT SUBJECT:\n${app.draft.subject}\n\nCURRENT BODY:\n${app.draft.body}\n\nPaste your edited version below.\nFormat as:\nSUBJECT: ...\n\nBODY:\n...\n\nOr just paste the full rewritten email (first line = subject).\nReply CANCEL to exit edit mode.`);
          continue;
        }

        if (textLower.startsWith("edit ")) {
          clearConfirmSession();
          const ref = rawText.trim().slice(5).trim();
          const app = resolveAppByRef(ref);
          if (!app) { await sendMsg(fromChat, "Not found. Reply LIST to see pending."); continue; }
          startEditSession(app.jobId, fromChat);
          await sendMsg(fromChat, `EDIT MODE | ${app.jobId}\nJob: ${app.job.title} @ ${app.job.company || "Unknown"}\nTo: ${app.draft.toEmail || app.job.email || "?"}\n\nCURRENT SUBJECT:\n${app.draft.subject}\n\nCURRENT BODY:\n${app.draft.body}\n\nPaste your edited version below.\nFormat as:\nSUBJECT: ...\n\nBODY:\n...\n\nOr just paste the full rewritten email (first line = subject).\nReply CANCEL to exit edit mode.`);
          continue;
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

setInterval(poll, 500);
poll();
