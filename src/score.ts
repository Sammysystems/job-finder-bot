import type { Job } from "./types.js";
import {
  CORE_TITLE_PATTERNS,
  ADJACENT_TITLE_PATTERNS,
  AI_SIGNAL_PATTERNS,
  SUPPORTING_KEYWORDS,
  EXCLUDE_KEYWORDS,
  EXCLUDE_TITLE_PATTERNS,
  OPEN_REGION_PATTERNS,
  BLOCKED_LOCATION_PATTERNS,
  REMOTE_BY_DEFAULT_SOURCES,
} from "./config/keywords.js";
import { classifyEligibility, eligibilityRank } from "./eligibility.js";

export interface ScoredJob extends Job {
  score: number;
  matchedTerms: string[];
  reasons: string[];
}

function lower(value?: string): string {
  return (value ?? "").toLowerCase();
}

function daysAgo(dateStr?: string): number {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 999;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word/phrase match, so "UK" matches "UK, USA" but "ukulele" does not. */
function containsPhrase(haystack: string, phrase: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase)}([^a-z0-9]|$)`, "i");
  return pattern.test(haystack);
}

const REMOTE_ONLY_WORDS = new Set([
  "remote",
  "fully",
  "100",
  "job",
  "jobs",
  "work",
  "from",
  "home",
  "wfh",
  "homeoffice",
  "office",
  "distributed",
  "telecommute",
  "anywhere",
  "worldwide",
  "world",
  "global",
  "based",
  "only",
  "the",
  "and",
  "or",
  "in",
  "of",
  "a",
  "an",
  "to",
  "with",
  "for",
  "at",
  "on",
]);

/**
 * Default-deny geography: a location passes only when it is an open region, is
 * empty, or contains nothing but remote words. Any leftover place name
 * ("Kansas", "Seoul", "Americas") means the role is not worldwide.
 */
function locationIsOpen(location: string): boolean {
  if (!location.trim()) return true;
  if (OPEN_REGION_PATTERNS.some((pattern) => containsPhrase(location, pattern))) return true;

  const leftovers = location
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !REMOTE_ONLY_WORDS.has(token))
    .filter((token) => !/^\d+$/.test(token));

  return leftovers.length === 0;
}

function isRemoteEligible(job: Job): boolean {
  const location = lower(job.location);
  const title = lower(job.title);
  const source = lower(job.source).split(":")[0];

  const openRegion = OPEN_REGION_PATTERNS.some((pattern) => containsPhrase(location, pattern));

  // Titles carry restrictions as often as the location field does
  // ("Backend Developer - Remote from EU", "Engineer (US-Based)").
  const titleClosed = BLOCKED_LOCATION_PATTERNS.some((pattern) => containsPhrase(title, pattern));
  if (titleClosed && !openRegion) return false;

  if (!locationIsOpen(location)) return false;
  if (job.remote === false && !openRegion) return false;
  if (job.remote === true) return true;
  if (REMOTE_BY_DEFAULT_SOURCES.includes(source)) return true;
  return openRegion;
}

function countSignals(text: string, patterns: string[]): string[] {
  const hits: string[] = [];
  for (const pattern of patterns) {
    if (containsPhrase(text, pattern)) hits.push(pattern.trim());
  }
  return hits;
}

/**
 * Returns null when a listing is not a fit. Gates run before scoring:
 * wrong title, wrong work, or a country-locked location is out regardless of
 * how fresh or how senior it is.
 */
export function scoreJob(job: Job): ScoredJob | null {
  const title = lower(job.title);
  const description = lower(job.description);
  const haystack = `${title} ${description}`;
  const reasons: string[] = [];
  let score = 0;

  if (EXCLUDE_TITLE_PATTERNS.some((pattern) => containsPhrase(title, pattern))) return null;
  if (EXCLUDE_KEYWORDS.some((pattern) => haystack.includes(lower(pattern)))) return null;

  const coreMatches = countSignals(title, CORE_TITLE_PATTERNS);
  const adjacentMatches = countSignals(title, ADJACENT_TITLE_PATTERNS);
  const descriptionSignals = countSignals(description, AI_SIGNAL_PATTERNS);

  const ROLE_WORDS =
    /\b(engineer|developer|programmer|scientist|architect|builder|founding)\b/i;

  // Either the title names AI/automation work, or it is a general engineering
  // title that the description proves is AI/automation work.
  const isCore = coreMatches.length > 0;
  const isAdjacent = (adjacentMatches.length > 0 || ROLE_WORDS.test(title)) && descriptionSignals.length >= 1;
  const isWebDev = false; // disable general web dev expansion for now - only AI/automation

  if (!isCore && !isAdjacent && !isWebDev) {
    if (job.source === "hn" && job.email && (/\bhiring\b/i.test(haystack) || ROLE_WORDS.test(title))) {
      // allow
    } else {
      return null;
    }
  }

  if (!isRemoteEligible(job)) return null;

  if (isCore) {
    score += Math.min(coreMatches.length, 2) * 6;
    reasons.push(`core:${coreMatches[0]}`);
  } else {
    score += Math.min(adjacentMatches.length, 2) * 2;
    reasons.push(`adjacent:${adjacentMatches[0]}`);
  }

  score += Math.min(descriptionSignals.length, 4);
  reasons.push(`signal:${descriptionSignals.length}`);

  const supporting = countSignals(haystack, SUPPORTING_KEYWORDS);
  if (supporting.length > 0) {
    score += Math.min(supporting.length, 3) * 0.5;
  }

  score += 3;
  reasons.push("remote");

  const age = daysAgo(job.postedAt);
  if (age < 1) {
    score += 3;
    reasons.push("today");
  } else if (age < 3) {
    score += 2;
    reasons.push("recent");
  } else if (age < 7) {
    score += 1;
    reasons.push("this-week");
  } else if (age > 14) {
    score -= 2;
    reasons.push("stale");
  }

  if (/\b(senior|lead)\b/.test(title)) {
    score += 1;
    reasons.push("senior");
  } else if (/\b(junior|entry|graduate|trainee)\b/.test(title)) {
    score -= 2;
    reasons.push("junior");
  }

  const eligibility = classifyEligibility(job);
  if (eligibility.onsite && eligibility.tier === "onsite") return null;
  if (eligibility.tier === "usa") score -= 2;
  if (eligibility.tier === "emea") score -= 1;
  score += eligibilityRank(eligibility.tier);
  reasons.push(eligibility.label);

  if (job.salary) {
    score += 1;
    reasons.push("salary");
  }

  if (lower(job.source).startsWith("ashby:")) {
    score += 1;
    reasons.push("target-company");
  }

  return {
    ...job,
    score: Math.round(score * 10) / 10,
    matchedTerms: [...new Set([...coreMatches, ...adjacentMatches])],
    reasons,
  };
}

export function rankAndSelect(jobs: Job[], limit = 10): ScoredJob[] {
  const scored: ScoredJob[] = [];

  for (const job of jobs) {
    const result = scoreJob(job);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return daysAgo(a.postedAt) - daysAgo(b.postedAt);
  });

  // No more than two roles from the same company, so one employer cannot fill
  // the whole brief with near-identical postings.
  const perCompany = new Map<string, number>();
  const selected: ScoredJob[] = [];

  for (const job of scored) {
    const company = lower(job.company) || lower(job.source);
    const count = perCompany.get(company) ?? 0;
    if (count >= 2) continue;
    perCompany.set(company, count + 1);
    selected.push(job);
    if (selected.length >= limit) break;
  }

  return selected;
}
