import type { Job } from "./types.js";

const DESCRIPTION_LIMIT = 2000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "\u2022",
  middot: "\u00b7",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  euro: "\u20ac",
  pound: "\u00a3",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Some feeds (RemoteOK) serve UTF-8 that has already been read as Latin-1,
 * producing "â€™" instead of "'". Re-decoding the bytes repairs the whole
 * string at once; if the round trip loses data we keep the original.
 */
function repairMojibake(text: string): string {
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const decoded = Buffer.from(text, "latin1").toString("utf8");
    return decoded.includes("\uFFFD") ? text : decoded;
  } catch {
    return text;
  }
}

/**
 * Turns a job description into readable plain text.
 *
 * Several boards double-encode their HTML (`&lt;p&gt;`), so entities are decoded
 * twice before tags are removed. Unicode replacement characters and control
 * bytes are dropped because they survive the round trip as mojibake.
 */
export function stripHtml(input?: string | null): string {
  if (!input) return "";

  let text = repairMojibake(input);
  text = decodeEntities(decodeEntities(text));

  text = text
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|ul|ol|h[1-6]|tr|section|article)\s*>/gi, "\n")
    .replace(/<\s*(li)[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");

  text = text
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

export function truncate(input: string, limit = DESCRIPTION_LIMIT): string {
  if (input.length <= limit) return input;
  const cut = input.slice(0, limit);
  const boundary = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary + 1) : cut).trimEnd()}\u2026`;
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gh_src",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "source",
]);

/**
 * Removes tracking parameters and trailing slashes so the same posting reached
 * through two feeds collapses onto one identity.
 */
export function canonicalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();

    const search = url.searchParams.toString();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.host}${path}${search ? `?${search}` : ""}`;
  } catch {
    return trimmed;
  }
}

const REMOTE_PATTERN =
  /\b(remote|anywhere|worldwide|world-wide|distributed|work\s*from\s*(home|anywhere)|wfh|telecommut\w*|fully\s*remote|global)\b/i;

export function detectRemote(...signals: (string | null | undefined)[]): boolean {
  return signals.some((signal) => Boolean(signal && REMOTE_PATTERN.test(signal)));
}

function formatAmount(value: number): string {
  if (value >= 1000) {
    const thousands = value / 1000;
    return `$${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
  }
  return `$${value}`;
}

/**
 * Accepts either structured bounds (Jobicy, RemoteOK) or a free-text salary
 * string (Remotive) and returns one display value, or nothing.
 */
export function parseSalary(input: {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  text?: string | null;
}): string | undefined {
  const { min, max, currency, text } = input;
  const low = typeof min === "number" && min > 0 ? min : undefined;
  const high = typeof max === "number" && max > 0 ? max : undefined;

  if (low !== undefined || high !== undefined) {
    const prefix = (currency ?? "USD").toUpperCase();
    if (low !== undefined && high !== undefined && low !== high) {
      return `${prefix} ${formatAmount(low)}\u2013${formatAmount(high)}`;
    }
    return `${prefix} ${formatAmount((low ?? high) as number)}`;
  }

  const cleaned = text?.replace(/\s+/g, " ").trim();
  if (!cleaned || !/\d/.test(cleaned)) return undefined;
  return truncate(cleaned, 60);
}

export interface NormalizeInput {
  id?: string | number | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  description?: string | null;
  postedAt?: string | null;
  source: string;
  remote?: boolean;
  salary?: string | null;
}

/**
 * Single gate every source passes through: stable id, absolute url, plain-text
 * description capped at 2k, and a remote flag the scorer can trust.
 */
export function normalizeJob(input: NormalizeInput): Job | null {
  const title = stripHtml(input.title).replace(/\s+/g, " ").trim();
  const url = canonicalUrl(input.url ?? "");
  if (!title || !/^https?:\/\//i.test(url)) return null;

  const rawDescription = stripHtml(input.description);
  const description = rawDescription ? truncate(rawDescription, DESCRIPTION_LIMIT) : undefined;
  const location = stripHtml(input.location).replace(/\s+/g, " ").trim() || undefined;
  const company = stripHtml(input.company).replace(/\s+/g, " ").trim() || undefined;

  const id = input.id === undefined || input.id === null || input.id === "" ? url : String(input.id);
  const salary = input.salary ? parseSalary({ text: input.salary }) : undefined;

  return {
    id: `${input.source}:${id}`,
    title,
    company,
    location,
    url,
    description,
    postedAt: input.postedAt ?? undefined,
    source: input.source,
    remote: input.remote ?? detectRemote(location, title, rawDescription.slice(0, 500)),
    ...(salary ? { salary } : {}),
  };
}

export { DESCRIPTION_LIMIT };
