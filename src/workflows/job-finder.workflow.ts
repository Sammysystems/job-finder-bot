import { createWorkflowChain, andThen } from "@voltagent/core";
import { z } from "zod";
import { fetchJobs } from "../tools/fetch-jobs.tool.js";
import { filterJobs } from "../tools/filter-jobs.tool.js";
import { saveNewJobs } from "../tools/save-jobs.tool.js";
import { notifyJobs } from "../tools/notify.tool.js";
import type { MatchedJob } from "../tools/filter-jobs.tool.js";

const summarySchema = z.object({
  fetched: z.number(),
  matched: z.number(),
  newJobs: z.number(),
  notified: z.number(),
  sources: z.array(z.string()),
  matches: z.array(
    z.object({
      title: z.string(),
      company: z.string().optional(),
      location: z.string().optional(),
      url: z.string(),
    })
  ),
});

export const jobFinderWorkflow = createWorkflowChain({
  id: "job-finder",
  name: "Job Finder",
  purpose:
    "Fetch job listings from the configured source, filter for relevance, persist unseen jobs, and notify on new matches.",
  input: z.object({}),
  result: summarySchema,
})
  .andThen({
    id: "fetch",
    execute: async () => {
      const jobs = await fetchJobs();
      return { fetched: jobs, sources: [...new Set(jobs.map((j) => j.source))] };
    },
  })
  .andThen({
    id: "filter",
    execute: async ({ data }) => {
      const matched = filterJobs(data.fetched);
      return { ...data, matched };
    },
  })
  .andThen({
    id: "save",
    execute: async ({ data }) => {
      const fresh = saveNewJobs(data.matched);
      return { ...data, fresh: fresh as MatchedJob[] };
    },
  })
  .andThen({
    id: "notify",
    execute: async ({ data }) => {
      const result = await notifyJobs(data.fresh);
      return {
        fetched: data.fetched.length,
        matched: data.matched.length,
        newJobs: data.fresh.length,
        notified: result.sent,
        sources: data.sources,
        matches: data.fresh.map((j) => ({
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
        })),
      };
    },
  });
