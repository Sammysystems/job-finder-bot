import type { Job } from "./types.js";

function normalize(s?: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (longer.length === 0) return 1.0;
  const distance = levenshtein(longer, shorter);
  return (longer.length - distance) / longer.length;
}

export interface DedupeKey {
  url: string;
  companyTitle: string;
  fuzzy: string;
}

export function getDedupeKeys(job: Job): DedupeKey {
  const company = normalize(job.company);
  const title = normalize(job.title);
  return {
    url: job.url,
    companyTitle: `${company}|${title}`,
    fuzzy: `${company}|${title}`,
  };
}

export function isDuplicate(job: Job, seen: Set<string>): boolean {
  const keys = getDedupeKeys(job);
  if (seen.has(keys.url)) return true;
  if (seen.has(keys.companyTitle)) return true;
  return false;
}

export function markSeen(job: Job, seen: Set<string>): void {
  const keys = getDedupeKeys(job);
  seen.add(keys.url);
  seen.add(keys.companyTitle);
}

export function deduplicateJobs(jobs: Job[], seenUrls?: Set<string>): Job[] {
  const seen = seenUrls ?? new Set<string>();
  const result: Job[] = [];
  
  for (const job of jobs) {
    if (isDuplicate(job, seen)) continue;
    
    // Fuzzy check against already added jobs
    const keys = getDedupeKeys(job);
    const isFuzzyDup = result.some(existing => {
      const existingKeys = getDedupeKeys(existing);
      if (existingKeys.companyTitle === keys.companyTitle) return true;
      if (similarity(existing.company || "", job.company || "") > 0.9 && 
          similarity(existing.title, job.title) > 0.85) {
        return true;
      }
      return false;
    });
    
    if (isFuzzyDup) continue;
    markSeen(job, seen);
    result.push(job);
  }
  
  return result;
}
