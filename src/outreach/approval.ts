import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { draftColdEmail } from "./draft-email.js";
import { upsertDraft, getApp, markSent, markSkipped, markEdited, markFailed } from "./applications.js";
import { sendGmail } from "./gmail-sender.js";
import type { Job } from "../types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.resolve(HERE, "../../profile/outreach.json");

function loadProfile() {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      const raw = fs.readFileSync(PROFILE_PATH, "utf8");
      const clean = raw.replace(/^\uFEFF/, "");
      return JSON.parse(clean);
    }
  } catch {}
  return { sender: { github: "https://github.com/Sammysystems" } };
}

export function prepareEmailPacket(job: Job) {
  const draft = draftColdEmail(job);
  const toEmail = job.email;
  const app = upsertDraft(job, draft, toEmail);
  const profile = loadProfile();
  return { job, draft, app, toEmail, senderGithub: profile.sender.github };
}

export function buildApprovalKeyboard(jobId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Send", callback_data: `app:send:${jobId}` },
        { text: "✏️ Edit", callback_data: `app:edit:${jobId}` },
        { text: "⏭ Skip", callback_data: `app:skip:${jobId}` },
      ],
    ],
  };
}

export function formatEmailPacketForTelegram(job: Job, draft: { subject: string; body: string }, toEmail?: string) {
  const header = `<b>📧 Email Draft</b>\n`;
  const meta = `Role: <b>${escapeHtml(job.title)}</b>\nCompany: ${job.company ? escapeHtml(job.company) : "Unknown"}\nTo: ${toEmail ? escapeHtml(toEmail) : "<i>no email on post</i>"}\nSource: ${escapeHtml(job.source)}\n\n`;
  const subj = `<b>Subject:</b> ${escapeHtml(draft.subject)}\n\n`;
  const body = `<pre>${escapeHtml(draft.body)}</pre>\n\n`;
  const note = toEmail ? `<i>Tap Send to email this via Gmail. Edit to tweak. Skip to ignore.</i>` : `<i>No direct email found. Use "Open Apply Link" if provided.</i>`;
  return header + meta + subj + body + note;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function handleApprovalCallback(data: string, chatId: number | string) {
  // data format: app:send:jobId or app:skip:jobId or app:edit:jobId
  const parts = data.split(":");
  if (parts[0] !== "app" || parts.length < 3) return { ok: false, error: "bad callback" };
  const action = parts[1];
  const jobId = parts.slice(2).join(":"); // in case id has colons

  const app = getApp(jobId);
  if (!app) return { ok: false, error: "draft not found" };

  if (action === "skip") {
    markSkipped(jobId);
    return { ok: true, action: "skipped", text: `Skipped: ${app.job.title} @ ${app.job.company || "?"}` };
  }

  if (action === "send") {
    const to = app.draft.toEmail || app.job.email;
    if (!to) {
      return { ok: false, error: "No recipient email on this job. Cannot send." };
    }
    const res = await sendGmail({ to, subject: app.draft.subject, text: app.draft.body });
    if (res.ok) {
      markSent(jobId, res.messageId);
      return { ok: true, action: "sent", text: `Sent email to ${to} for ${app.job.title}` };
    } else {
      markFailed(jobId, res.error || "send failed");
      return { ok: false, error: res.error };
    }
  }

  if (action === "edit") {
    // For now, mark as edited and tell user to reply/edit manually; full edit flow can be expanded
    markEdited(jobId, app.draft);
    return { ok: true, action: "edit", text: `Edit mode noted for ${app.job.title}. Reply with new subject/body or use the bot flow later.` };
  }

  return { ok: false, error: "unknown action" };
}
