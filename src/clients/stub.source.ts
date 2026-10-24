import type { JobSource } from "./types.js";
import type { Job } from "../types.js";

/**
 * Fixture source used until a real generated client exists.
 * It exists so the pipeline can be exercised end to end today.
 */
const FIXTURE_JOBS: Job[] = [
  {
    id: "stub-1",
    title: "AI Automation Engineer",
    company: "Example Labs",
    location: "Remote (Worldwide)",
    url: "https://example.com/jobs/stub-1",
    description:
      "Build LLM agents, workflow automation, and API integrations using TypeScript and Node.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
  {
    id: "stub-2",
    title: "Senior Frontend Developer",
    company: "Example Labs",
    location: "Remote (Worldwide)",
    url: "https://example.com/jobs/stub-2",
    description: "React and Tailwind design systems work.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
  {
    id: "stub-3",
    title: "Sales Intern",
    company: "Example Labs",
    location: "On-site",
    url: "https://example.com/jobs/stub-3",
    description: "Outbound calling.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
];

export const stubSource: JobSource = {
  name: "stub",
  async fetchJobs() {
    return FIXTURE_JOBS;
  },
};
