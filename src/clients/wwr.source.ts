import { XMLParser } from "fast-xml-parser";
import type { Job } from "../types.js";
import type { JobSource } from "./types.js";
import { fetchText } from "./http.js";
import { normalizeJob } from "../normalize.js";

/**
 * We Work Remotely marketing and design category feeds — public RSS, no key.
 *
 *   GET https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss
 *   GET https://weworkremotely.com/categories/remote-design-jobs.rss
 *
 * Titles arrive as "Company: Role", descriptions are HTML-escaped inside
 * CDATA, and `pubDate` is RFC 822.
 */

const ENDPOINTS = [
  "https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss",
  "https://weworkremotely.com/categories/remote-design-jobs.rss",
];

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

export interface WwrOptions {
  endpoints?: string[];
}

export function createWwrSource(options: WwrOptions = {}): JobSource {
  const endpoints = options.endpoints ?? ENDPOINTS;

  return {
    name: "wwr",
    async fetchJobs() {
      const seen = new Map<string, Job>();
      const failures: string[] = [];

      for (const endpoint of endpoints) {
        try {
          const xml = await fetchText(endpoint, {
            headers: { accept: "application/rss+xml, application/xml, text/xml" },
          });
          const parsed = parser.parse(xml) as {
            rss?: { channel?: { item?: WwrItem | WwrItem[] } };
          };
          if (!parsed.rss?.channel) {
            throw new Error("RSS response did not contain a channel");
          }

          for (const item of asArray(parsed.rss.channel.item)) {
            const job = toJob(item);
            if (job && !seen.has(job.url)) seen.set(job.url, job);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${endpoint}: ${message}`);
          console.warn(`[wwr] feed failed: ${endpoint}: ${message}`);
        }
      }

      if (endpoints.length > 0 && failures.length === endpoints.length) {
        throw new Error(`WWR: all category feeds failed: ${failures.join("; ")}`);
      }

      return [...seen.values()];
    },
  };
}

export const wwrSource = createWwrSource();
