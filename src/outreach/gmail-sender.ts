import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.resolve(HERE, "../../profile/outreach.json");

interface OutreachProfile {
  sender: { name: string; github: string; email: string; gmailAppPassword?: string };
}

function loadProfile(): OutreachProfile {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      const raw = fs.readFileSync(PROFILE_PATH, "utf8");
      const clean = raw.replace(/^\uFEFF/, "");
      return JSON.parse(clean);
    }
  } catch {}
  return {
    sender: {
      name: process.env.SENDER_NAME || "AI Automation Engineer",
      github: process.env.SENDER_GITHUB || "https://github.com/Sammysystems",
      email: "",
    },
  };
}

/**
 * Credentials resolve from the environment first so a cloned repo runs without
 * a personal profile file. profile/outreach.json is a local convenience only.
 */
export async function sendGmail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const profile = loadProfile();
  const user = process.env.GMAIL_USER || profile.sender.email;
  const pass = process.env.GMAIL_APP_PASSWORD || profile.sender.gmailAppPassword;
  const fromName = process.env.SENDER_NAME || profile.sender.name || "AI Automation Engineer";

  if (!user || !pass) {
    return { ok: false, error: "Missing Gmail credentials (set GMAIL_USER and GMAIL_APP_PASSWORD)" };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      replyTo: opts.replyTo || user,
    });

    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
