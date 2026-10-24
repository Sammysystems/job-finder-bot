import { XMLParser } from "fast-xml-parser";
import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { fetchText } from "./http.js";
import { normalizeJob } from "../normalize.js";

/**
 * We Work Remotely category feed — public RSS, no key.
 *
 *   GET https://weworkremotely.com/categories/remote-programming-jobs.rss
 *
 * 25 items per feed. Titles arrive as "Company: Role", descriptions are
 * HTML-escaped inside CDATA, and `pubDate` is RFC 822.
 */

const ENDPOINT = "https://weworkremotely.com/categories/remote-programming-jobs.rss";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
});

interface WwrItem {
  title?: string;
  region?: string;
  category?: string;
  description?: string;
  pubDate?: string;
  guid?: string | { "#text"?: string };
  link?: string;
  type?: string;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as { "#text"?: unknown })["#text"];
    return typeof text === "string" ? text : undefined;
  }
  return undefined;
}

function toJob(raw: WwrItem): Job | null {
  const rawTitle = textOf(raw.title)?.trim() ?? "";
  if (!rawTitle) return null;

  const separator = rawTitle.indexOf(":");
  const company = separator > 0 ? rawTitle.slice(0, separator).trim() : undefined;
  const title = separator > 0 ? rawTitle.slice(separator + 1).trim() : rawTitle;

  const region = textOf(raw.region)?.trim();
  const category = textOf(raw.category)?.trim();
  const type = textOf(raw.type)?.trim();
  const description = [category, type, textOf(raw.description)].filter(Boolean).join("\n\n");

  const link = textOf(raw.link) ?? textOf(raw.guid) ?? "";
  const url = link.trim() || undefined;

  return normalizeJob({
    id: url,
    title,
    company,
    location: region,
    url,
    description,
    postedAt: raw.pubDate ? new Date(raw.pubDate).toISOString() : undefined,
    source: "wwr",
    remote: true,
  });
}

export function createWwrSource(): JobSource {
  return {
    name: "wwr",
    async fetchJobs() {
      const xml = await fetchText(ENDPOINT, {
        headers: { accept: "application/rss+xml, application/xml, text/xml" },
      });

      const parsed = parser.parse(xml) as {
        rss?: { channel?: { item?: WwrItem | WwrItem[] } };
      };

      const items = asArray(parsed.rss?.channel?.item);
      const seen = new Map<string, Job>();

      for (const item of items) {
        const job = toJob(item);
        if (job && !seen.has(job.url)) seen.set(job.url, job);
      }

      return [...seen.values()];
    },
  };
}

export const wwrSource = createWwrSource();
