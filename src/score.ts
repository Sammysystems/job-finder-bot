import type { Job } from "./types.js";
import {
  EXCLUDED_JOB_PATTERNS,
  EXCLUDED_TITLE_PATTERNS,
  TARGET_ROLE_FAMILIES,
  OPEN_REGION_PATTERNS,
  BLOCKED_LOCATION_PATTERNS,
  REMOTE_BY_DEFAULT_SOURCES,
} from "./config/keywords.js";
import { classifyEligibility, eligibilityRank } from "./eligibility.js";

export interface ScoredJob extends Job {
  roleFamily: string;
  score: number;
  matchedTerms: string[];
  reasons: string[];
}

export interface TargetRoleMatch {
  roleFamily: string;
  roleLabel: string;
  matchedTitle: string;
  evidence: string[];
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

export function matchTargetRole(job: Job): TargetRoleMatch | null {
  const title = lower(job.title);
  const description = lower(job.description);
  const haystack = `${title} ${description}`;

  if (EXCLUDED_TITLE_PATTERNS.some((pattern) => containsPhrase(title, pattern))) {
    return null;
  }
  if (EXCLUDED_JOB_PATTERNS.some((pattern) => containsPhrase(haystack, pattern))) {
    return null;
  }

  for (const family of TARGET_ROLE_FAMILIES) {
    const matchedTitle = family.titlePatterns.find((pattern) => containsPhrase(title, pattern));
    if (!matchedTitle) continue;

    const evidence = family.evidenceGroups
      .map((group) => group.find((signal) => containsPhrase(description, signal)))
      .filter((signal): signal is string => Boolean(signal));

    if (evidence.length < family.minimumEvidenceGroups) continue;

    return {
      roleFamily: family.id,
      roleLabel: family.label,
      matchedTitle,
      evidence,
    };
  }

  return null;
}

/**
 * Role and geography must pass hard gates before recency or other ranking
 * bonuses are considered.
 */
export function scoreJob(job: Job): ScoredJob | null {
  const title = lower(job.title);
  const reasons: string[] = [];
  const roleMatch = matchTargetRole(job);
  if (!roleMatch) return null;
  if (!isRemoteEligible(job)) return null;

  const eligibility = classifyEligibility(job);
  if (eligibility.onsite && eligibility.tier === "onsite") return null;

  let score = 10 + Math.max(0, roleMatch.evidence.length - 2) * 2;
  reasons.push(`role:${roleMatch.roleLabel}`);
  reasons.push(...roleMatch.evidence.map((term) => `evidence:${term}`));
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
    roleFamily: roleMatch.roleLabel,
    score: Math.round(score * 10) / 10,
    matchedTerms: [...new Set([roleMatch.matchedTitle, ...roleMatch.evidence])],
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
