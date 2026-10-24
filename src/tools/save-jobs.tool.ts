import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { Job } from "../types.js";
import { loadSeenJobs, saveSeenJobs, isNewJob, markJobSeen } from "../db/index.js";

export function saveNewJobs(jobs: Job[]): Job[] {
  const store = loadSeenJobs();
  const fresh: Job[] = [];

  for (const job of jobs) {
    if (!isNewJob(job, store)) continue;
    markJobSeen(job, store);
    fresh.push(job);
  }

  if (fresh.length > 0) saveSeenJobs(store);
  return fresh;
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
});

export const saveJobsTool = createTool({
  name: "save_jobs",
  description: "Persist unseen jobs and return only the newly added ones.",
  parameters: z.object({ jobs: z.array(jobSchema) }),
  execute: async ({ jobs }) => {
    const added = saveNewJobs(jobs);
    return { success: true, added: added.length, jobs: added };
  },
});
