import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { fetchJson } from "./http.js";
import { normalizeJob, parseSalary } from "../normalize.js";

/**
 * Remote OK public API — free, no key, single response.
 *
 *   GET https://remoteok.com/api
 *
 * Element 0 is a legal notice, not a job — it is skipped explicitly.
 * The feed returns 100 rows (their cap), every one remote.
 *
 * Their API terms require a link back to Remote OK and that the source be
 * named. The stored URL is remoteok.com and `source` is "remoteok", so any
 * digest built downstream can attribute without special-casing.
 */

const ENDPOINT = "https://remoteok.com/api";

interface RemoteOkJob {
  id?: number | string;
  slug?: string;
  position?: string;
  title?: string;
  company?: string;
  location?: string;
  tags?: string[];
  description?: string;
  date?: string;
  epoch?: number;
  url?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
}

function toJob(raw: RemoteOkJob): Job | null {
  const description = [raw.tags?.length ? raw.tags.join(", ") : "", raw.description ?? ""]
    .filter(Boolean)
    .join("\n\n");

  return normalizeJob({
    id: raw.id ?? raw.slug,
    title: raw.position ?? raw.title,
    company: raw.company,
    location: raw.location || "Remote",
    url: raw.url || raw.apply_url,
    description,
    postedAt: raw.date,
    salary: parseSalary({ min: raw.salary_min, max: raw.salary_max, currency: "USD" }),
    source: "remoteok",
    remote: true,
  });
}

export function createRemoteOkSource(): JobSource {
  return {
    name: "remoteok",
    async fetchJobs() {
      const payload = await fetchJson<unknown>(ENDPOINT);
      if (!Array.isArray(payload)) {
        throw new Error("RemoteOK: expected an array response");
      }

      const seen = new Map<string, Job>();

      for (const entry of payload) {
        if (!entry || typeof entry !== "object") continue;
        const candidate = entry as RemoteOkJob;
        if (!candidate.position && !candidate.title) continue;

        const job = toJob(candidate);
        if (job && !seen.has(job.url)) seen.set(job.url, job);
      }

      return [...seen.values()];
    },
  };
}

export const remoteokSource = createRemoteOkSource();
