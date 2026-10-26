import { describe, expect, it } from "vitest";
import type { Job } from "../src/types.js";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "test:1",
    title: "AI Automation Engineer",
    company: "Acme",
    location: "Remote",
    url: "https://example.com/jobs/1",
    description: "Build LLM agents and workflow automation with the OpenAI API.",
    source: "stub",
    remote: true,
    ...overrides,
  };
}

import {
  canonicalUrl,
  detectRemote,
  normalizeJob,
  parseSalary,
  stripHtml,
  truncate,
} from "../src/normalize.js";
import { classifyEligibility, eligibilityRank } from "../src/eligibility.js";
import { scoreJob, rankAndSelect } from "../src/score.js";
import { deduplicateJobs } from "../src/dedupe.js";
import { isReply } from "../src/signals/hn.source.js";

describe("stripHtml", () => {
  it("decodes double-encoded HTML and drops tags", () => {
    const out = stripHtml("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;");
    expect(out).toBe("Hello & welcome");
  });

  it("turns list items into dash lines", () => {
    const out = stripHtml("<ul><li>One</li><li>Two</li></ul>");
    expect(out.replace(/\n+/g, "\n")).toBe("- One\n- Two");
  });

  it("removes script and style bodies entirely", () => {
    const out = stripHtml("<p>Keep</p><script>bad()</script><style>.x{}</style>");
    expect(out).toBe("Keep");
  });
});

describe("truncate", () => {
  it("returns short input unchanged", () => {
    expect(truncate("short", 20)).toBe("short");
  });

  it("cuts on a sentence boundary when one is near the limit", () => {
    const text = "First sentence here. Second sentence goes on and on.";
    const out = truncate(text, 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("First sentence here.");
  });
});

describe("canonicalUrl", () => {
  it("strips tracking params, fragments, and trailing slashes", () => {
    const out = canonicalUrl("https://Example.com/jobs/1/?utm_source=x&ref=y#apply");
    expect(out).toBe("https://example.com/jobs/1");
  });

  it("keeps meaningful query params", () => {
    const out = canonicalUrl("https://example.com/jobs?id=42&utm_medium=email");
    expect(out).toBe("https://example.com/jobs?id=42");
  });

  it("returns unparseable input unchanged", () => {
    expect(canonicalUrl("not a url")).toBe("not a url");
  });
});

describe("parseSalary", () => {
  it("formats a range in thousands", () => {
    expect(parseSalary({ min: 120000, max: 160000 })).toBe("USD $120k–$160k");
  });

  it("returns a single value when bounds match", () => {
    expect(parseSalary({ min: 90000, max: 90000, currency: "eur" })).toBe("EUR $90k");
  });

  it("rejects free text with no digits", () => {
    expect(parseSalary({ text: "competitive" })).toBeUndefined();
  });
});

describe("detectRemote", () => {
  it("matches several phrasings", () => {
    expect(detectRemote("Fully Remote")).toBe(true);
    expect(detectRemote(undefined, "work from home")).toBe(true);
    expect(detectRemote("New York, NY")).toBe(false);
  });
});

describe("normalizeJob", () => {
  it("builds a namespaced id and absolute url", () => {
    const out = normalizeJob({
      id: 7,
      title: "  AI Engineer  ",
      company: " Acme ",
      location: "Remote (Worldwide)",
      url: "https://example.com/j/7/?utm_source=hn",
      source: "hn",
    });
    expect(out).not.toBeNull();
    expect(out!.id).toBe("hn:7");
    expect(out!.url).toBe("https://example.com/j/7");
    expect(out!.title).toBe("AI Engineer");
    expect(out!.remote).toBe(true);
  });

  it("rejects a listing with no title or relative url", () => {
    expect(normalizeJob({ title: "", url: "https://x.com", source: "stub" })).toBeNull();
    expect(normalizeJob({ title: "AI Engineer", url: "/jobs/1", source: "stub" })).toBeNull();
  });

  it("falls back to the url as the id", () => {
    const out = normalizeJob({ title: "AI Engineer", url: "https://example.com/a", source: "stub" });
    expect(out!.id).toBe("stub:https://example.com/a");
  });
});

describe("classifyEligibility", () => {
  it("ranks worldwide above region-locked roles", () => {
    const world = classifyEligibility(job({ location: "Remote, Worldwide" }));
    const usa = classifyEligibility(job({ location: "Remote, USA only" }));
    expect(world.tier).toBe("worldwide");
    expect(usa.tier).toBe("usa");
    expect(eligibilityRank(world.tier)).toBeGreaterThan(eligibilityRank(usa.tier));
  });

  it("flags onsite and hybrid as not remote", () => {
    expect(classifyEligibility(job({ location: "Lagos", title: "AI Engineer (Onsite)" })).onsite).toBe(true);
    expect(classifyEligibility(job({ location: "Hybrid", title: "AI Engineer" })).onsite).toBe(true);
  });

  it("treats a bare Remote as open", () => {
    expect(classifyEligibility(job({ location: "Remote" })).tier).toBe("open");
  });
});

describe("scoreJob", () => {
  it("keeps a core AI automation role", () => {
    const out = scoreJob(job({ title: "AI Automation Engineer" }));
    expect(out).not.toBeNull();
    expect(out!.score).toBeGreaterThan(0);
    expect(out!.reasons).toContain("core:ai automation");
  });

  it("rejects an excluded title", () => {
    expect(scoreJob(job({ title: "Senior DevOps Engineer" }))).toBeNull();
  });

  it("rejects a country-locked role", () => {
    expect(scoreJob(job({ location: "Remote, USA only" }))).toBeNull();
  });

  it("rejects a non-AI generalist title", () => {
    expect(scoreJob(job({ title: "Marketing Manager", description: "Run campaigns." }))).toBeNull();
  });

  it("accepts a general engineering title only when the description proves AI work", () => {
    const withAi = job({
      title: "Software Engineer",
      description: "You will build LLM agents and RAG pipelines using the OpenAI API.",
    });
    const withoutAi = job({
      title: "Software Engineer",
      description: "Maintain our Rails monolith and billing pages.",
    });
    expect(scoreJob(withAi)).not.toBeNull();
    expect(scoreJob(withoutAi)).toBeNull();
  });
});

describe("rankAndSelect", () => {
  it("caps each company at two roles", () => {
    const jobs = Array.from({ length: 6 }, (_, i) =>
      job({ id: `test:${i}`, company: "Acme", title: `AI Engineer ${i}`, url: `https://example.com/${i}` })
    );
    const picked = rankAndSelect(jobs, 10);
    expect(picked.length).toBe(2);
  });

  it("orders by score", () => {
    const strong = job({ id: "test:strong", title: "AI Automation Engineer", url: "https://example.com/s" });
    const weak = job({ id: "test:weak", title: "Software Engineer", description: "LLM integration work.", url: "https://example.com/w" });
    const picked = rankAndSelect([weak, strong], 10);
    expect(picked[0].id).toBe("test:strong");
  });
});

describe("deduplicateJobs", () => {
  it("collapses the same posting reached through two feeds", () => {
    const a = job({ id: "a:1", url: "https://example.com/jobs/1", company: "Acme", title: "AI Engineer" });
    const b = job({ id: "b:1", url: "https://example.com/jobs/1/", company: "Acme", title: "AI Engineer" });
    expect(deduplicateJobs([a, b]).length).toBe(1);
  });

  it("collapses near-identical company and title", () => {
    const a = job({ id: "a:1", url: "https://a.example/1", company: "Acme Inc", title: "AI Automation Engineer" });
    const b = job({ id: "b:1", url: "https://b.example/1", company: "Acme Inc.", title: "AI Automation Engineer" });
    expect(deduplicateJobs([a, b]).length).toBe(1);
  });

  it("keeps genuinely different roles", () => {
    const a = job({ id: "a:1", url: "https://a.example/1", company: "Acme", title: "AI Engineer" });
    const b = job({ id: "b:1", url: "https://b.example/1", company: "Globex", title: "AI Engineer" });
    expect(deduplicateJobs([a, b]).length).toBe(2);
  });
});

describe("isReply", () => {
  it("keeps top-level comments and drops replies", () => {
    const thread = "123";
    expect(isReply({ objectID: "1", parent_id: 123 }, thread)).toBe(false);
    expect(isReply({ objectID: "2", parent_id: 999 }, thread)).toBe(true);
    expect(isReply({ objectID: "3" }, thread)).toBe(true);
    expect(isReply({ objectID: "4", parent_id: "123" }, thread)).toBe(false);
  });
});
