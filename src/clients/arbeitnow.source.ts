import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { fetchJson } from "./http.js";
import { normalizeJob } from "../normalize.js";

/**
 * Arbeitnow job board API — free, public, no key.
 *
 *   GET https://arbeitnow.com/api/job-board-api?page=<n>
 *
 * 300 jobs per page, ordered newest first, `created_at` in Unix seconds.
 * Two quirks are handled here:
 *   1. Pagination is unstable — a new posting shifts the window and pages
 *      overlap (40 shared rows observed between pages 1 and 2). Rows are
 *      deduped by slug inside this client.
 *   2. The feed paginates indefinitely, so we stop on age rather than trusting
 *      `links.next`. Arbeitnow asks users not to abuse the API; one crawl per
 *      day with an age cutoff is the polite shape.
 * Their terms ask for a link back to the site — the stored URL is the original
 * Arbeitnow job page, so attribution survives downstream.
 */

const ENDPOINT = "https://arbeitnow.com/api/job-board-api";
const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_MAX_PAGES = 3;
const PAGE_GAP_MS = 900;

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number | string;
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
  links?: { next?: string | null };
  meta?: { current_page?: number };
}

function toIso(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toEpochMs(value: number | string | undefined): number | undefined {
  const iso = toIso(value);
  return iso ? Date.parse(iso) : undefined;
}

function toJob(raw: ArbeitnowJob): Job | null {
  const tags = [...(raw.tags ?? []), ...(raw.job_types ?? [])].filter(Boolean);
  const description = [tags.length ? tags.join(", ") : "", raw.description ?? ""]
    .filter(Boolean)
    .join("\n\n");

  return normalizeJob({
    id: raw.slug,
    title: raw.title,
    company: raw.company_name,
    location: raw.location,
    url: raw.url,
    description,
    postedAt: toIso(raw.created_at),
    source: "arbeitnow",
    remote: raw.remote === true ? true : undefined,
  });
}

export interface ArbeitnowOptions {
  maxAgeDays?: number;
  maxPages?: number;
}

export function createArbeitnowSource(options: ArbeitnowOptions = {}): JobSource {
  const maxAgeDays = options.maxAgeDays ?? (Number(process.env.ARBEITNOW_MAX_AGE_DAYS) || DEFAULT_MAX_AGE_DAYS);
  const maxPages = options.maxPages ?? (Number(process.env.ARBEITNOW_MAX_PAGES) || DEFAULT_MAX_PAGES);

  return {
    name: "arbeitnow",
    async fetchJobs() {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      const seen = new Map<string, Job>();

      for (let page = 1; page <= maxPages; page++) {
        if (page > 1) await new Promise((resolve) => setTimeout(resolve, PAGE_GAP_MS));

        let payload: ArbeitnowResponse;
        try {
          payload = await fetchJson<ArbeitnowResponse>(`${ENDPOINT}?page=${page}`, { retries: 1 });
        } catch (error) {
          // A rate limit on a later page should cost us that page, not the
          // whole source. Keep what we already collected.
          if (seen.size > 0) {
            console.warn(`[arbeitnow] stopping at page ${page}: ${String(error)}`);
            break;
          }
          throw error;
        }

        const rows = payload.data ?? [];
        if (rows.length === 0) break;

        let oldestOnPage = Number.POSITIVE_INFINITY;

        for (const raw of rows) {
          const createdMs = toEpochMs(raw.created_at);
          if (createdMs !== undefined) oldestOnPage = Math.min(oldestOnPage, createdMs);
          if (createdMs !== undefined && createdMs < cutoff) continue;

          const job = toJob(raw);
          if (job && !seen.has(job.url)) seen.set(job.url, job);
        }

        if (!payload.links?.next) break;
        if (oldestOnPage < cutoff) break;
      }

      return [...seen.values()];
    },
  };
}

export const arbeitnowSource = createArbeitnowSource();
