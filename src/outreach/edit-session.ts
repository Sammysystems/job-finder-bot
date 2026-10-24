import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../data");
const SESSION_PATH = path.join(DATA_DIR, "edit-session.json");

export interface EditSession {
  active: boolean;
  jobId: string | null;
  chatId: string | number | null;
  startedAt: string | null;
}

export interface ConfirmSession {
  action: "send" | "skip" | null;
  jobId: string | null;
  chatId: string | number | null;
  startedAt: string | null;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadEditSession(): EditSession {
  ensureDir();
  try {
    if (!fs.existsSync(SESSION_PATH)) {
      return { active: false, jobId: null, chatId: null, startedAt: null };
    }
    const raw = fs.readFileSync(SESSION_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { active: false, jobId: null, chatId: null, startedAt: null };
  }
}

export function saveEditSession(session: EditSession) {
  ensureDir();
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
}

export function startEditSession(jobId: string, chatId: string | number) {
  saveEditSession({
    active: true,
    jobId,
    chatId,
    startedAt: new Date().toISOString(),
  });
}

export function clearEditSession() {
  saveEditSession({ active: false, jobId: null, chatId: null, startedAt: null });
}

export function isInEditMode(chatId?: string | number) {
  const s = loadEditSession();
  if (!s.active) return false;
  if (chatId && s.chatId && s.chatId.toString() !== chatId.toString()) return false;
  return true;
}

// Confirmation for send/skip
const CONFIRM_PATH = path.join(DATA_DIR, "approval-confirm.json");

export function loadConfirmSession(): ConfirmSession {
  ensureDir();
  try {
    if (!fs.existsSync(CONFIRM_PATH)) {
      return { action: null, jobId: null, chatId: null, startedAt: null };
    }
    const raw = fs.readFileSync(CONFIRM_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { action: null, jobId: null, chatId: null, startedAt: null };
  }
}

export function saveConfirmSession(session: ConfirmSession) {
  ensureDir();
  fs.writeFileSync(CONFIRM_PATH, JSON.stringify(session, null, 2));
}

export function startConfirmSession(action: "send" | "skip", jobId: string, chatId: string | number) {
  saveConfirmSession({
    action,
    jobId,
    chatId,
    startedAt: new Date().toISOString(),
  });
}

export function clearConfirmSession() {
  saveConfirmSession({ action: null, jobId: null, chatId: null, startedAt: null });
}

export function hasPendingConfirm(chatId?: string | number) {
  const s = loadConfirmSession();
  if (!s.action || !s.jobId) return false;
  if (chatId && s.chatId && s.chatId.toString() !== chatId.toString()) return false;
  return true;
}
