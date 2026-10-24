import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { Job } from "../types.js";

/**
 * Entry point for the data layer. Once reverse-api-engineer produces a client in
 * src/clients/, import it here and map its response into Job[].
 *
 * The stub stays in place until a real client exists so the pipeline is runnable.
 */
export async function fetchJobs(): Promise<Job[]> {
  const { getJobSource } = await import("../clients/index.js");
  const source = await getJobSource();
  return source.fetchJobs();
}

export const fetchJobsTool = createTool({
  name: "fetch_jobs",
  description: "Fetch raw job listings from the configured target career page.",
  parameters: z.object({}),
  execute: async () => {
    try {
      const jobs = await fetchJobs();
      return { success: true, count: jobs.length, jobs };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});
