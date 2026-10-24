import type { JobSource } from "./types.js";
import { stubSource } from "./stub.source.js";
import { fetchAllSources } from "./registry.js";

export type { JobSource } from "./types.js";
export { fetchAllSources } from "./registry.js";

/**
 * Returns one source for the pipeline.
 *
 * `JOB_SOURCE=stub` keeps the pipeline offline-friendly. Anything else resolves
 * to the registry, which fans out across every enabled source and returns their
 * combined listings.
 */
export async function getJobSource(): Promise<JobSource> {
  const mode = (process.env.JOB_SOURCE ?? "").toLowerCase();
  if (mode === "stub") return stubSource;

  return {
    name: "registry",
    async fetchJobs() {
      const { jobs } = await fetchAllSources();
      return jobs;
    },
  };
}
