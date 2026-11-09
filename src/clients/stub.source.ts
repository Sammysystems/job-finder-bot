import type { JobSource } from "./types.js";
import type { Job } from "../types.js";

/**
 * Offline fixtures exercise target families and representative false positives.
 */
const FIXTURE_JOBS: Job[] = [
  {
    id: "stub-1",
    title: "Creative Strategist",
    company: "Example Creative",
    location: "Remote (Worldwide)",
    url: "https://example.com/jobs/stub-1",
    description:
      "Develop creative concepts and write creative briefs for paid social campaigns. Use audience insights to plan campaign strategy.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
  {
    id: "stub-2",
    title: "Copywriter",
    company: "Example Story Studio",
    location: "Remote (Worldwide)",
    url: "https://example.com/jobs/stub-2",
    description:
      "Write copy for landing pages and email campaigns. Maintain a consistent brand voice and test messaging.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
  {
    id: "stub-3",
    title: "Email Marketing Strategist",
    company: "Example Inbox",
    location: "Remote (Worldwide)",
    url: "https://example.com/jobs/stub-3",
    description:
      "Plan email campaigns, manage audience segmentation and lifecycle journeys, and track click-through performance.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
  {
    id: "stub-4",
    title: "Content Strategist",
    company: "Example Editorial",
    location: "Remote (Worldwide)",
    url: "https://example.com/jobs/stub-4",
    description:
      "Own the content strategy and editorial calendar, using audience research to improve organic traffic.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
  {
    id: "stub-5",
    title: "Senior Software Engineer",
    company: "Example Software",
    location: "Remote (Worldwide)",
    url: "https://example.com/jobs/stub-5",
    description: "Build APIs and SaaS products using AI tools.",
    postedAt: new Date().toISOString(),
    source: "stub",
  },
  {
    id: "stub-6",
    title: "Sales Intern",
    company: "Example Sales",
    location: "On-site",
    url: "https://example.com/jobs/stub-6",
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
