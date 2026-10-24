import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { fetchJson } from "./http.js";
import { normalizeJob, parseSalary } from "../normalize.js";

/**
 * Remotive public API — documented, free, no key.
 *
 *   GET https://remotive.com/api/remote-jobs?search=<term>&limit=<n>
 *
 * Remotive asks that API users not re-post their listings wholesale; we only
 * surface titles, links and a short excerpt to one person.
 */

const ENDPOINT = "https://remotive.com/api/remote-jobs";
const DEFAULT_QUERIES = [
  "automation",
  "ai",
  "llm",
  "agent",
  "integration",
  "typescript",
  "n8n",
];
const MAX_JOBS = 200;

interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  publication_date?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

function toJob(raw: RemotiveJob): Job | null {
  return normalizeJob({
    id: raw.id,
    title: raw.title,
    company: raw.company_name,
    location: raw.candidate_required_location,
    url: raw.url,
    description: raw.description,
    postedAt: raw.publication_date,
    salary: parseSalary({ text: raw.salary }),
    source: "remotive",
    remote: true,
  });
}

export interface RemotiveOptions {
  queries?: string[];
  limit?: number;
}

export function createRemotiveSource(options: RemotiveOptions = {}): JobSource {
  const queries = options.queries ?? DEFAULT_QUERIES;
  const limit = options.limit ?? MAX_JOBS;

  return {
    name: "remotive",
    async fetchJobs() {
      const seen = new Map<string, Job>();

      for (const query of queries) {
        const url = `${ENDPOINT}?search=${encodeURIComponent(query)}&limit=${limit}`;
        const payload = await fetchJson<RemotiveResponse>(url);
        for (const raw of payload.jobs ?? []) {
          const job = toJob(raw);
          if (job && !seen.has(job.url)) seen.set(job.url, job);
        }
      }

      return [...seen.values()];
    },
  };
}

export const remotiveSource = createRemotiveSource();
