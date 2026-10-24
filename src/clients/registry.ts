import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { ashbySource } from "./ashby.source.js";
import { remotiveSource } from "./remotive.source.js";
import { jobicySource } from "./jobicy.source.js";
import { arbeitnowSource } from "./arbeitnow.source.js";
import { remoteokSource } from "./remoteok.source.js";
import { wwrSource } from "./wwr.source.js";
import { hackerNewsSource } from "../signals/hn.source.js";

/**
 * One place that knows every source.
 *
 * `JOB_SOURCES` is a comma-separated list; unknown names are reported once and
 * skipped rather than silently ignored. Leaving it empty enables every source.
 * `JOB_SOURCE=ashby|remotive|...` still works as a single-source shortcut, and
 * `JOB_SOURCE=stub` is handled by clients/index.ts before this point.
 */

export const SOURCE_FACTORIES: Record<string, () => JobSource> = {
  ashby: () => ashbySource,
  remotive: () => remotiveSource,
  jobicy: () => jobicySource,
  arbeitnow: () => arbeitnowSource,
  remoteok: () => remoteokSource,
  wwr: () => wwrSource,
  hn: () => hackerNewsSource,
};

export const SOURCE_NAMES = Object.keys(SOURCE_FACTORIES);

export interface SourceReport {
  source: string;
  count: number;
  ms: number;
  error?: string;
}

export interface FetchAllResult {
  jobs: Job[];
  report: SourceReport[];
  unknown: string[];
}

const GAP_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function selectedSourceNames(env: NodeJS.ProcessEnv = process.env): {
  names: string[];
  unknown: string[];
} {
  const raw = env.JOB_SOURCES?.trim();

  if (!raw) {
    const single = env.JOB_SOURCE?.trim().toLowerCase();
    if (single && single !== "stub" && single !== "registry" && single !== "all") {
      if (SOURCE_FACTORIES[single]) return { names: [single], unknown: [] };
      return { names: SOURCE_NAMES, unknown: [single] };
    }
    return { names: SOURCE_NAMES, unknown: [] };
  }

  const requested = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  const names: string[] = [];
  const unknown: string[] = [];

  for (const name of requested) {
    if (SOURCE_FACTORIES[name]) {
      if (!names.includes(name)) names.push(name);
    } else {
      unknown.push(name);
    }
  }

  return { names: names.length ? names : SOURCE_NAMES, unknown };
}

/**
 * Runs every enabled source in sequence — never in parallel, so a slow or
 * hostile endpoint cannot multiply our request rate. A failure is captured as
 * a report row; it never aborts the run.
 */
export async function fetchAllSources(
  env: NodeJS.ProcessEnv = process.env
): Promise<FetchAllResult> {
  const { names, unknown } = selectedSourceNames(env);
  const jobs: Job[] = [];
  const report: SourceReport[] = [];

  for (const [index, name] of names.entries()) {
    if (index > 0) await sleep(GAP_MS);

    const started = Date.now();
    try {
      const source = SOURCE_FACTORIES[name]();
      const fetched = await source.fetchJobs();
      jobs.push(...fetched);
      report.push({ source: name, count: fetched.length, ms: Date.now() - started });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.push({ source: name, count: 0, ms: Date.now() - started, error: message });
      console.warn(`[registry] ${name} failed: ${message}`);
    }
  }

  if (unknown.length) {
    console.warn(`[registry] unknown source(s) ignored: ${unknown.join(", ")}`);
  }

  return { jobs, report, unknown };
}

export function buildSources(env: NodeJS.ProcessEnv = process.env): JobSource[] {
  return selectedSourceNames(env).names.map((name) => SOURCE_FACTORIES[name]());
}
