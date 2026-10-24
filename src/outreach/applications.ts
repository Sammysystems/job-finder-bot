import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job } from "../types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../data");
const APPS_PATH = path.join(DATA_DIR, "applications.json");

export type AppStatus = "drafted" | "sent" | "skipped" | "edited" | "failed";

export interface ApplicationRecord {
  jobId: string;
  job: Job & { score?: number; reasons?: string[]; matchedTerms?: string[] };
  draft: { subject: string; body: string; repo?: any; toEmail?: string };
  status: AppStatus;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  messageId?: string;
  error?: string;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll(): Record<string, ApplicationRecord> {
  ensureDir();
  try {
    if (!fs.existsSync(APPS_PATH)) return {};
    return JSON.parse(fs.readFileSync(APPS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveAll(store: Record<string, ApplicationRecord>) {
  ensureDir();
  fs.writeFileSync(APPS_PATH, JSON.stringify(store, null, 2));
}

export function upsertDraft(job: Job, draft: { subject: string; body: string; repo?: any }, toEmail?: string) {
  const store = loadAll();
  const id = job.id;
  const now = new Date().toISOString();
  if (!store[id]) {
    store[id] = {
      jobId: id,
      job: job as any,
      draft: { ...draft, toEmail },
      status: "drafted",
      createdAt: now,
      updatedAt: now,
    };
  } else {
    store[id].draft = { ...store[id].draft, ...draft, toEmail: toEmail || store[id].draft.toEmail };
    store[id].updatedAt = now;
    if (store[id].status === "skipped") store[id].status = "drafted";
  }
  saveAll(store);
  return store[id];
}

export function getApp(jobId: string): ApplicationRecord | undefined {
  return loadAll()[jobId];
}

export function getAllApps(): ApplicationRecord[] {
  return Object.values(loadAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPendingDrafts(): ApplicationRecord[] {
  return getAllApps().filter(a => a.status === "drafted");
}

export function markSent(jobId: string, messageId?: string) {
  const store = loadAll();
  if (!store[jobId]) return;
  const now = new Date().toISOString();
  store[jobId].status = "sent";
  store[jobId].sentAt = now;
  store[jobId].updatedAt = now;
  if (messageId) store[jobId].messageId = messageId;
  saveAll(store);
}

export function markSkipped(jobId: string) {
  const store = loadAll();
  if (!store[jobId]) return;
  const now = new Date().toISOString();
  store[jobId].status = "skipped";
  store[jobId].updatedAt = now;
  saveAll(store);
}

export function markEdited(jobId: string, draft: { subject: string; body: string }) {
  const store = loadAll();
  if (!store[jobId]) return;
  const now = new Date().toISOString();
  store[jobId].draft = { ...store[jobId].draft, ...draft };
  store[jobId].status = "edited";
  store[jobId].updatedAt = now;
  saveAll(store);
}

export function markFailed(jobId: string, error: string) {
  const store = loadAll();
  if (!store[jobId]) return;
  const now = new Date().toISOString();
  store[jobId].status = "failed";
  store[jobId].error = error;
  store[jobId].updatedAt = now;
  saveAll(store);
}
