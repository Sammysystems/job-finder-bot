/**
 * Shared fetch wrapper for every public job feed.
 *
 * Rules encoded here, once:
 *  - every request has a timeout (no hanging runs)
 *  - bounded retry with exponential backoff + jitter
 *  - 429/503 honour Retry-After but never wait longer than 5s
 *  - a descriptive User-Agent, so we are a polite named client and not a
 *    mystery IP hitting a free API
 */

export const USER_AGENT =
  "job-finder-bot/1.0 (personal job search; one request per source per day)";

export interface RequestOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

const DEFAULTS = { timeoutMs: 20_000, retries: 2 };
const MAX_RETRY_AFTER_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return 400 * 2 ** attempt + Math.floor(Math.random() * 200);
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return undefined;
}

export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const retries = options.retries ?? DEFAULTS.retries;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "*/*",
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
        redirect: "follow",
      });

      if (response.ok) return response;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }

      const wait = retryAfterMs(response.headers.get("retry-after")) ?? backoffMs(attempt);
      lastError = new Error(`HTTP ${response.status} for ${url}`);
      await sleep(wait);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  return (await response.json()) as T;
}

export async function fetchText(url: string, options: RequestOptions = {}): Promise<string> {
  const response = await request(url, options);
  return response.text();
}
