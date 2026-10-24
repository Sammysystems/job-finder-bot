import type { Job } from "../types.js";
import type { JobSource } from "../clients/types.js";
import { fetchJson } from "../clients/http.js";
import { normalizeJob, stripHtml } from "../normalize.js";

/**
 * Hacker News "Ask HN: Who is hiring?" — the highest-signal free source for
 * early-stage roles. Public Algolia API, no key.
 *
 *   1. find the latest thread:  /v1/search_by_date?query="Who is hiring"&tags=story
 *   2. read its comments:       /v1/search?tags=comment,story_<id>&hitsPerPage=1000
 *
 * Only top-level comments are job posts (replies are discussion), which is why
 * `parent_id === threadId` is the filter. Posts are prose, so the header line is
 * parsed heuristically:
 *
 *   Company | Role | REMOTE (EU) | Full-time | $120k-$160k
 */

const ALGOLIA = "https://hn.algolia.com/api/v1";
const THREAD_QUERY = '"Who is hiring"';

interface AlgoliaStory {
  objectID: string;
  title?: string;
  created_at?: string;
  num_comments?: number;
}

interface AlgoliaComment {
  objectID: string;
  parent_id?: number | string;
  author?: string;
  created_at?: string;
  comment_text?: string | null;
}

interface AlgoliaResponse<T> {
  hits: T[];
}

export interface HiringThread {
  id: string;
  title: string;
  createdAt?: string;
  comments: number;
}

export async function findLatestHiringThread(): Promise<HiringThread | null> {
  const payload = await fetchJson<AlgoliaResponse<AlgoliaStory>>(
    `${ALGOLIA}/search_by_date?query=${encodeURIComponent(THREAD_QUERY)}&tags=story&hitsPerPage=20`
  );

  const threads = payload.hits
    .filter((hit) => /^Ask HN: Who is hiring\?/i.test(hit.title ?? ""))
    .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));

  const latest = threads[0];
  if (!latest) return null;

  return {
    id: latest.objectID,
    title: latest.title ?? "Ask HN: Who is hiring?",
    createdAt: latest.created_at,
    comments: latest.num_comments ?? 0,
  };
}

const ROLE_WORDS =
  /\b(engineer|developer|programmer|scientist|architect|designer|manager|lead|head|director|founder|cto|coo|ops|operations|marketing|sales|recruiter|analyst|consultant|specialist|writer|editor|support|success)\b/i;
const REMOTE_WORDS = /\b(remote|onsite|on-site|hybrid|wfh|anywhere)\b/i;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

function firstExternalUrl(html: string): string | undefined {
  const matches = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  return matches.find((href) => {
    const lower = href.toLowerCase();
    return (
      lower.startsWith("http") &&
      !lower.includes("news.ycombinator.com") &&
      !lower.includes("twitter.com") &&
      !lower.includes("x.com/")
    );
  });
}

function cleanCompany(value: string): string | undefined {
  const company = value
    .replace(/\((?:yc|y combinator)[^)]*\)/gi, "")
    .replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, "")
    .trim();
  if (!company || company.length > 60) return undefined;
  if (/^https?:/i.test(company)) return undefined;
  return company;
}

function parseHeader(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 3);

  const headerLine =
    lines.find((line) => line.includes("|") && ROLE_WORDS.test(line)) ??
    lines.find((line) => line.includes("|")) ??
    lines[0] ??
    "";

  if (headerLine.includes("|")) {
    return headerLine.split("|").map((part) => part.trim()).filter(Boolean);
  }

  if (/(is|are)\s+hiring/i.test(headerLine)) {
    return [headerLine];
  }

  return [headerLine.trim()];
}

function extractFields(segments: string[]): { company?: string; title: string; location?: string } {
  if (segments.length === 1) {
    const single = segments[0];
    const hiringMatch = single.match(/^(.{2,60}?)\s+(?:is|are)\s+hiring/i);
    if (hiringMatch) {
      return {
        company: cleanCompany(hiringMatch[1]),
        title: single.slice(0, 160),
        location: single,
      };
    }
    return {
      company: undefined,
      title: single.slice(0, 160),
      location: single,
    };
  }

  const nonGeo = segments.filter((segment) => !REMOTE_WORDS.test(segment));

  const roleIndex = nonGeo.findIndex((segment) => ROLE_WORDS.test(segment));
  const title =
    (roleIndex >= 0 ? nonGeo[roleIndex] : nonGeo[1] ?? nonGeo[0] ?? segments[1] ?? segments[0])?.slice(0, 160) ??
    segments[0];

  const company = cleanCompany(nonGeo[0] ?? segments[0] ?? "");

  const locationSegment =
    segments.find((segment) => REMOTE_WORDS.test(segment)) ??
    segments.find((segment) =>
      /\b(usa|u\.s\.|us|eu|emea|europe|worldwide|anywhere|onsite|india|canada|uk|germany|africa|hybrid)\b/i.test(segment)
    );

  return { company: company === title || !company ? undefined : company, title, location: locationSegment };
}

export function isReply(comment: AlgoliaComment, threadId: string): boolean {
  if (comment.parent_id === undefined || comment.parent_id === null) return true;
  return String(comment.parent_id) !== String(threadId);
}

function isJobPost(text: string): boolean {
  if (text.length < 40) return false;
  if (/^I'm applying|^Applied|^Any update|^Thanks|^Following|^Would love|^@[^ ]+[\s:]/i.test(text)) return false;
  if (EMAIL_PATTERN.test(text)) return true;
  if (ROLE_WORDS.test(text) || /\bhiring\b/i.test(text)) return true;
  return false;
}

function parseHiringComment(comment: AlgoliaComment, threadId: string): Job | null {
  const html = comment.comment_text ?? "";
  if (!html.trim()) return null;

  const text = stripHtml(html);
  if (!isJobPost(text)) return null;

  const segments = parseHeader(text);
  const fields = extractFields(segments);

  const headerText = segments.join(" | ");
  const remote = REMOTE_WORDS.test(headerText) && !/\bonsite\b/i.test(headerText);
  const email = text.match(EMAIL_PATTERN)?.[0];
  const url =
    firstExternalUrl(html) ?? `https://news.ycombinator.com/item?id=${comment.objectID}`;

  const job = normalizeJob({
    id: comment.objectID,
    title: fields.title,
    company: fields.company,
    location: fields.location || headerText,
    url,
    description: text,
    postedAt: comment.created_at,
    source: "hn",
    remote,
  });

  if (!job) return null;

  return {
    ...job,
    ...(email ? { email } : {}),
    threadId,
  };
}

export interface HackerNewsOptions {
  /** Restrict to a specific thread id (used by tests and backfills). */
  threadId?: string;
  maxComments?: number;
}

export function createHackerNewsSource(options: HackerNewsOptions = {}): JobSource {
  return {
    name: "hn",
    async fetchJobs() {
      const thread = options.threadId
        ? { id: options.threadId, title: "manual", comments: 0 }
        : await findLatestHiringThread();

      if (!thread) return [];

      const limit = options.maxComments ?? 1000;
      const payload = await fetchJson<AlgoliaResponse<AlgoliaComment>>(
        `${ALGOLIA}/search?tags=${encodeURIComponent(`comment,story_${thread.id}`)}&hitsPerPage=${limit}`
      );

      const jobs: Job[] = [];
      const seen = new Set<string>();

      for (const comment of payload.hits) {
        // Replies are discussion, not job posts.
        if (isReply(comment, thread.id)) continue;

        const job = parseHiringComment(comment, thread.id);
        if (!job) continue;
        if (seen.has(job.url)) continue;

        seen.add(job.url);
        jobs.push(job);
      }

      return jobs;
    },
  };
}

export const hackerNewsSource = createHackerNewsSource();
