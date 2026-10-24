import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { Job } from "../types.js";
import { rankAndSelect } from "../score.js";
import { deduplicateJobs } from "../dedupe.js";
import { loadSeenJobs } from "../db/index.js";
import { classifyEligibility } from "../eligibility.js";

export interface MatchedJob extends Job {
  matchedTerms: string[];
  score: number;
  reasons: string[];
}

export function filterJobs(jobs: Job[]): MatchedJob[] {
  // First deduplicate within this batch and against seen jobs
  const seenStore = loadSeenJobs();
  const seenSet = new Set(Object.keys(seenStore.jobs));

  const deduped = deduplicateJobs(jobs, seenSet);

  // Attach eligibility labels before scoring/ranking.
  const labeled = deduped.map((job) => {
    const eligibility = classifyEligibility(job);
    return { ...job, eligibility: eligibility.label };
  });

  // Score and rank - take top 10
  const ranked = rankAndSelect(labeled, 10);

  return ranked.map((job) => ({
    ...job,
    matchedTerms: job.matchedTerms,
  }));
}

const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string().optional(),
  location: z.string().optional(),
  url: z.string(),
  description: z.string().optional(),
  postedAt: z.string().optional(),
  source: z.string(),
  remote: z.boolean().optional(),
  salary: z.string().optional(),
  matchedTerms: z.array(z.string()).optional(),
  score: z.number().optional(),
  reasons: z.array(z.string()).optional(),
});

export const filterJobsTool = createTool({
  name: "filter_jobs",
  description: "Filter jobs by relevance keywords, exclusions, and location rules.",
  parameters: z.object({ jobs: z.array(jobSchema) }),
  execute: async ({ jobs }) => {
    const matched = filterJobs(jobs);
    return { success: true, total: jobs.length, matched: matched.length, jobs: matched };
  },
});
