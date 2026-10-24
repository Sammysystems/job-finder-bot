import type { StoredJob } from "../types.js";

export interface SeenJobsStore {
  jobs: Record<string, StoredJob>;
}
