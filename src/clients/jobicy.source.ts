import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { fetchJson } from "./http.js";
import { normalizeJob, parseSalary } from "../normalize.js";

/**
 * Jobicy public API — documented, free, no key.
 *
 *   GET https://jobicy.com/api/v2/remote-jobs?count=<n>&tag=<tag>
 *
 * `jobGeo` is a region ("Europe", "USA"), not a remote flag; every listing in
 * this feed is remote by definition, so `remote` is set explicitly.
 */

const ENDPOINT = "https://jobicy.com/api/v2/remote-jobs";
const DEFAULT_TAGS = ["automation", "llm", "machine-learning", "python", "javascript"];
const MAX_JOBS = 50;

interface JobicyJob {
  id?: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobGeo?: string;
  jobLevel?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  annualSalaryMin?: number | string | null;
  annualSalaryMax?: number | string | null;
  salaryCurrency?: string | null;
}

interface JobicyResponse {
  jobs?: JobicyJob[];
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toJob(raw: JobicyJob): Job | null {
  const description = [raw.jobLevel, ...(raw.jobType ?? []), ...(raw.jobIndustry ?? []), raw.jobDescription]
    .filter(Boolean)
    .join(" · ");

  return normalizeJob({
    id: raw.id,
    title: raw.jobTitle,
    company: raw.companyName,
    location: raw.jobGeo,
    url: raw.url,
    description,
    postedAt: raw.pubDate,
    salary: parseSalary({
      min: toNumber(raw.annualSalaryMin),
      max: toNumber(raw.annualSalaryMax),
      currency: raw.salaryCurrency,
    }),
    source: "jobicy",
    remote: true,
  });
}

export interface JobicyOptions {
  tags?: string[];
  count?: number;
}

export function createJobicySource(options: JobicyOptions = {}): JobSource {
  const tags = options.tags ?? DEFAULT_TAGS;
  const count = options.count ?? MAX_JOBS;

  return {
    name: "jobicy",
    async fetchJobs() {
      const seen = new Map<string, Job>();

      for (const tag of tags) {
        const url = `${ENDPOINT}?count=${count}&tag=${encodeURIComponent(tag)}`;
        const payload = await fetchJson<JobicyResponse>(url);
        for (const raw of payload.jobs ?? []) {
          const job = toJob(raw);
          if (job && !seen.has(job.url)) seen.set(job.url, job);
        }
      }

      return [...seen.values()];
    },
  };
}

export const jobicySource = createJobicySource();
