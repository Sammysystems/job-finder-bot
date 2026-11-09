import { draftColdEmail } from "./draft-email.js";
import { upsertDraft, getApp, markSkipped, markEdited } from "./applications.js";
import type { Job } from "../types.js";

export function prepareEmailPacket(job: Job) {
  const draft = draftColdEmail(job);
  const toEmail = job.email;
  const app = upsertDraft(job, draft, toEmail);
  return { job, draft, app, toEmail };
}

export function buildApprovalKeyboard(jobId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✏️ Edit", callback_data: `app:edit:${jobId}` },
        { text: "⏭ Skip", callback_data: `app:skip:${jobId}` },
      ],
    ],
  };
}

export function formatEmailPacketForTelegram(job: Job, draft: { subject: string; body: string }, toEmail?: string) {
  const header = `<b>📝 Application Draft</b>\n`;
  const meta = `Role: <b>${escapeHtml(job.title)}</b>\nCompany: ${job.company ? escapeHtml(job.company) : "Unknown"}\nTo: ${toEmail ? escapeHtml(toEmail) : "<i>no email on post</i>"}\nSource: ${escapeHtml(job.source)}\n\n`;
  const subj = `<b>Subject:</b> ${escapeHtml(draft.subject)}\n\n`;
  const body = `<pre>${escapeHtml(draft.body)}</pre>\n\n`;
  const note = toEmail ? `<i>Copy and submit this draft yourself. Edit to tweak or skip to ignore.</i>` : `<i>No direct email found. Copy this draft and use the job link to apply yourself.</i>`;
  return header + meta + subj + body + note;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function handleApprovalCallback(data: string, chatId: number | string) {
  // data format: app:skip:jobId or app:edit:jobId
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
    return { ok: false, error: "Sending is disabled. Copy the draft and submit it yourself." };
  }

  if (action === "edit") {
    // For now, mark as edited and tell user to reply/edit manually; full edit flow can be expanded
    markEdited(jobId, app.draft);
    return { ok: true, action: "edit", text: `Edit mode noted for ${app.job.title}. Reply with new subject/body or use the bot flow later.` };
  }

  return { ok: false, error: "unknown action" };
}
