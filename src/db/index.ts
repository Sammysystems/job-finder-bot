import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job, StoredJob } from "../types.js";
import type { SeenJobsStore } from "./schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH =
  process.env.SEEN_JOBS_PATH ?? path.resolve(HERE, "../../data/seen-jobs.json");

export function loadSeenJobs(): SeenJobsStore {
  try {
    if (!fs.existsSync(DATA_PATH)) return { jobs: {} };
    const raw = fs.readFileSync(DATA_PATH, "utf8").trim();
    if (!raw) return { jobs: {} };
    const parsed = JSON.parse(raw) as SeenJobsStore;
    return parsed?.jobs ? parsed : { jobs: {} };
  } catch {
    return { jobs: {} };
  }
}

export function saveSeenJobs(store: SeenJobsStore): void {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

export function getJobKey(job: Partial<Job>): string {
  if (job.url) return job.url;
  return [job.company ?? "", job.title ?? "", job.location ?? ""].join("|");
}

export function isNewJob(job: Partial<Job>, store: SeenJobsStore): boolean {
  return !store.jobs[getJobKey(job)];
}

export function markJobSeen(job: Job, store: SeenJobsStore): void {
  const stored: StoredJob = { ...job, seenAt: new Date().toISOString() };
  store.jobs[getJobKey(job)] = stored;
}

export function markJobNotified(job: Job, store: SeenJobsStore): void {
  const key = getJobKey(job);
  const existing = store.jobs[key];
  if (existing) existing.notifiedAt = new Date().toISOString();
}

export { DATA_PATH };
