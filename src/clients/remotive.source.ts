import { XMLParser } from "fast-xml-parser";
import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { fetchText } from "./http.js";
import { normalizeJob } from "../normalize.js";

/**
 * Remotive's public RSS feed, recommended by its API documentation.
 * The legacy search API currently returns the same programming-heavy results
 * for different search terms, so use the feed and let the role gate decide fit.
 * Listings are shared with Remotive attribution and their original links intact.
 */
const ENDPOINT = "https://remotive.com/remote-jobs/feed";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
});

interface RemotiveItem {
  title?: string;
  jobId?: string;
  company?: string;
  location?: string;
  type?: string;
  guid?: string | { "#text"?: string };
  link?: string;
  pubDate?: string;
  category?: string;
  description?: string;
}

interface RemotiveFeed {
  rss?: { channel?: { item?: RemotiveItem | RemotiveItem[] } };
}

export interface RemotiveOptions {
  feedUrl?: string;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as { "#text"?: unknown })["#text"];
    return typeof text === "string" ? text : undefined;
  }
  return undefined;
}

function toJob(raw: RemotiveItem): Job | null {
  return normalizeJob({
    id: raw.jobId,
    title: raw.title,
    company: raw.company,
    location: raw.location,
    url: raw.link || textOf(raw.guid),
    description: [raw.category, raw.type, raw.description].filter(Boolean).join("\n\n"),
    postedAt: raw.pubDate,
    source: "remotive",
    remote: true,
  });
}

export function parseRemotiveFeed(xml: string): Job[] {
  const parsed = parser.parse(xml) as RemotiveFeed;
  if (!parsed.rss?.channel) {
    throw new Error("Remotive: RSS response did not contain a channel");
  }

  const seen = new Map<string, Job>();
  for (const item of asArray(parsed.rss.channel.item)) {
    const job = toJob(item);
    if (job && !seen.has(job.url)) seen.set(job.url, job);
  }

  return [...seen.values()];
}

export function createRemotiveSource(options: RemotiveOptions = {}): JobSource {
  const feedUrl = options.feedUrl ?? ENDPOINT;

  return {
    name: "remotive",
    async fetchJobs() {
      const xml = await fetchText(feedUrl, {
        headers: { accept: "application/rss+xml, application/xml, text/xml" },
      });
      return parseRemotiveFeed(xml);
    },
  };
}

export const remotiveSource = createRemotiveSource();
