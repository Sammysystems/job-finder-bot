import type { Job } from "../types.js";
import type { JobSource } from "./types.js";

/**
 * Ashby-hosted job boards.
 *
 * Endpoint discovered by watching network traffic on https://jobs.ashbyhq.com/<org>
 * (see scripts/capture.ts and captures/). It is a POST GraphQL endpoint with no
 * public documentation:
 *
 *   POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams
 *   { operationName, variables: { organizationHostedJobsPageName }, query }
 *
 * Public listing data only. No auth, no cookies, low request volume.
 */

const ENDPOINT = "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams";

const QUERY = `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
  jobBoard: jobBoardWithTeams(
    organizationHostedJobsPageName: $organizationHostedJobsPageName
  ) {
    teams {
      id
      name
      externalName
      parentTeamId
    }
    jobPostings {
      id
      title
      teamId
      locationName
      workplaceType
      employmentType
      secondaryLocations {
        locationName
      }
    }
  }
}`;

interface AshbyPosting {
  id: string;
  title: string;
  teamId?: string | null;
  locationName?: string | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  secondaryLocations?: { locationName?: string | null }[] | null;
}

interface AshbyTeam {
  id: string;
  name?: string | null;
  externalName?: string | null;
  parentTeamId?: string | null;
}

interface AshbyResponse {
  data?: {
    jobBoard?: {
      teams?: AshbyTeam[];
      jobPostings?: AshbyPosting[];
    } | null;
  };
  errors?: { message: string }[];
}

export interface AshbySourceOptions {
  orgs: string[];
  timeoutMs?: number;
  retries?: number;
}

async function fetchBoard(org: string, opts: Required<Omit<AshbySourceOptions, "orgs">>) {
  const body = JSON.stringify({
    operationName: "ApiJobBoardWithTeams",
    variables: { organizationHostedJobsPageName: org },
    query: QUERY,
  });

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "*/*",
          "apollographql-client-name": "frontend_non_user",
          "apollographql-client-version": "0.1.0",
          origin: "https://jobs.ashbyhq.com",
          referer: `https://jobs.ashbyhq.com/${org}`,
        },
        body,
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Ashby ${org}: HTTP ${res.status}`);

      const json = (await res.json()) as AshbyResponse;
      if (json.errors?.length) {
        throw new Error(`Ashby ${org}: ${json.errors.map((e) => e.message).join("; ")}`);
      }
      return json;
    } catch (err) {
      lastError = err;
      if (attempt < opts.retries) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

function toJobs(org: string, payload: AshbyResponse): Job[] {
  const board = payload.data?.jobBoard;
  const postings = board?.jobPostings ?? [];
  const teams = new Map((board?.teams ?? []).map((t) => [t.id, t]));

  return postings
    .filter((p) => p?.id && p?.title)
    .map((p) => {
      const team = p.teamId ? teams.get(p.teamId) : undefined;
      const extraLocations = (p.secondaryLocations ?? [])
        .map((s) => s?.locationName)
        .filter((v): v is string => Boolean(v));

      const locations = [p.locationName, ...extraLocations].filter(
        (v): v is string => Boolean(v)
      );

      return {
        id: `ashby:${org}:${p.id}`,
        title: p.title,
        company: org,
        location: locations.length ? locations.join(" / ") : undefined,
        url: `https://jobs.ashbyhq.com/${org}/${p.id}`,
        description: [team?.name ?? team?.externalName, p.employmentType, p.workplaceType]
          .filter(Boolean)
          .join(" · "),
        source: `ashby:${org}`,
      } satisfies Job;
    });
}

function parseOrgs(raw: string | undefined): string[] {
  const defaults = ["lemfi", "supabase"];
  if (!raw) return defaults;
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : defaults;
}

export function createAshbySource(options?: Partial<AshbySourceOptions>): JobSource {
  const orgs = options?.orgs ?? parseOrgs(process.env.ASHBY_ORGS);
  const cfg = {
    timeoutMs: options?.timeoutMs ?? 15_000,
    retries: options?.retries ?? 2,
  };

  return {
    name: `ashby(${orgs.join(",")})`,
    async fetchJobs() {
      const results = await Promise.allSettled(orgs.map((org) => fetchBoard(org, cfg)));

      const jobs: Job[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          jobs.push(...toJobs(orgs[i], result.value));
        } else {
          console.warn(`[ashby] ${orgs[i]} failed: ${String(result.reason)}`);
        }
      });

      return jobs;
    },
  };
}

export const ashbySource = createAshbySource();
