import type { Job } from "../types.js";

/**
 * The contract every generated client must satisfy.
 * A reverse-api-engineer output gets wrapped into a JobSource so the rest of the
 * pipeline never cares which site it came from.
 */
export interface JobSource {
  name: string;
  fetchJobs(): Promise<Job[]>;
}
