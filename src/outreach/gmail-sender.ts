import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.resolve(HERE, "../../profile/outreach.json");

interface OutreachProfile {
  sender: { name: string; github: string; email: string; gmailAppPassword: string };
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
      name: "Samuel",
      github: "https://github.com/Sammysystems",
      email: process.env.GMAIL_USER || "",
      gmailAppPassword: process.env.GMAIL_APP_PASSWORD || "",
    },
  } as any;
}

export async function sendGmail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const profile = loadProfile();
  const user = profile.sender.email || process.env.GMAIL_USER;
  const pass = profile.sender.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return { ok: false, error: "Missing Gmail credentials (profile.outreach.json or env)" };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `"Samuel" <${user}>`,
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
