import { describe, expect, it } from "vitest";
import type { Job } from "../src/types.js";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "test:1",
    title: "Copywriter",
    company: "Acme",
    location: "Remote",
    url: "https://example.com/jobs/1",
    description: "Write copy for landing pages and email campaigns while maintaining the brand voice.",
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
import { draftColdEmail } from "../src/outreach/draft-email.js";
import { stubSource } from "../src/clients/stub.source.js";
import { DEFAULT_SOURCE_NAMES, selectedSourceNames, SOURCE_NAMES } from "../src/clients/registry.js";
import { parseRemotiveFeed } from "../src/clients/remotive.source.js";
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

  it("preserves role evidence beyond the former 2k description limit", () => {
    const description = `${"Role overview. ".repeat(200)}Creative concept development and creative testing.`;
    const out = normalizeJob({
      title: "Creative Strategist",
      url: "https://example.com/jobs/creative-strategist",
      source: "jobicy",
      description,
    });

    expect(out!.description).toContain("Creative concept development and creative testing.");
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
  it("keeps a copywriter role with evidence across responsibility groups", () => {
    const out = scoreJob(job());
    expect(out).not.toBeNull();
    expect(out!.score).toBeGreaterThan(0);
    expect(out!.roleFamily).toBe("Copywriter");
    expect(out!.matchedTerms).toContain("brand voice");
  });

  it("accepts creative strategy, email/lifecycle marketing, and content strategy responsibilities", () => {
    const creative = scoreJob(job({
      title: "Creative Strategist",
      description: "Develop creative concepts and write creative briefs for paid social campaigns.",
    }));
    const email = scoreJob(job({
      title: "Senior Lifecycle Marketing Manager",
      description: "Plan lifecycle campaigns, manage segmentation and customer journeys, and track retention.",
    }));
    const content = scoreJob(job({
      title: "Content Strategist",
      description:
        "Own the content strategy and editorial calendar, using audience research to improve organic traffic.",
    }));
    expect(creative?.roleFamily).toBe("Creative Strategist");
    expect(email?.roleFamily).toBe("Email/Lifecycle Marketing");
    expect(content?.roleFamily).toBe("Content Strategist");
  });

  it("recognizes performance creative strategy expressed through audience and ad-creation work", () => {
    const creative = scoreJob(job({
      title: "Performance Creative Strategist and AI Producer",
      location: "Anywhere in the World",
      description:
        "A hands-on performance creative operator creating static and video creative. " +
        "Use audience psychology and voice-of-customer interpretation to develop hooks and angles " +
        "for direct-response advertising and Meta creative strategy.",
    }));

    expect(creative?.roleFamily).toBe("Creative Strategist");
    expect(creative?.matchedTerms).toContain("performance creative");
    expect(creative?.matchedTerms).toContain("hooks");
    expect(creative?.matchedTerms).toContain("audience psychology");
  });

  it("recognizes a growth copywriter title through the copywriter family", () => {
    const growthCopywriter = scoreJob(job({
      title: "Growth Copywriter",
      description: "Write landing-page copy and test messaging to improve conversion rates.",
    }));

    expect(growthCopywriter?.roleFamily).toBe("Copywriter");
  });

  it("rejects a country-locked role", () => {
    expect(scoreJob(job({ location: "Remote, USA only" }))).toBeNull();
  });

  it("rejects generic engineering and AI research roles even when they mention related terms", () => {
    const unrelatedTitles = [
      "Senior Software Engineer",
      "Senior Backend Engineer",
      "Senior Frontend Engineer",
      "Senior Angular Full-stack Developer",
      "AI Research Engineer (Agentic Post-training)",
    ];
    for (const title of unrelatedTitles) {
      expect(scoreJob(job({ title, description: "Build APIs and SaaS products using AI tools." }))).toBeNull();
    }
  });

  it("rejects target-sounding titles without enough role-specific description evidence", () => {
    const weakCopywriter = job({
      title: "Copywriter",
      description: "Join our marketing team and help grow the business.",
    });
    const weakCreative = job({
      title: "Creative Strategist",
      description: "Join our team and help grow the business.",
    });
    expect(scoreJob(weakCopywriter)).toBeNull();
    expect(scoreJob(weakCreative)).toBeNull();
  });

  it("rejects unpaid target roles", () => {
    expect(scoreJob(job({ description: "Unpaid role. Write copy for a landing page." }))).toBeNull();
  });

  it("does not allow Hacker News contact listings to bypass the role gate", () => {
    const genericHnJob = job({
      title: "Backend Engineer",
      description: "Hiring an engineer to build APIs and workflows.",
      source: "hn",
      email: "jobs@example.com",
    });
    expect(scoreJob(genericHnJob)).toBeNull();
  });

  it("prepares a draft grounded in the posting without inventing candidate experience", () => {
    const draft = draftColdEmail(job());
    expect(draft.subject).toBe("Application: Copywriter at Acme");
    expect(draft.body).toContain("Write copy for landing pages and email campaigns");
    expect(draft.body).toContain("[Add one truthful example of relevant work");
    expect(draft.body).toContain("[Add a relevant portfolio or work-sample link.]");
  });

  it("refuses to draft an application for an out-of-scope role", () => {
    expect(() => draftColdEmail(job({ title: "Backend Engineer" }))).toThrow(/out-of-scope role/);
  });
});

describe("source configuration", () => {
  it("uses only the curated marketing-relevant sources by default", () => {
    expect(selectedSourceNames({}).names).toEqual(DEFAULT_SOURCE_NAMES);
    expect(selectedSourceNames({ JOB_SOURCE: "registry" }).names).toEqual(DEFAULT_SOURCE_NAMES);
    expect(selectedSourceNames({ JOB_SOURCE: "all" }).names).toEqual(SOURCE_NAMES);
  });

  it("allows explicit source selection without enabling unrelated feeds", () => {
    expect(selectedSourceNames({ JOB_SOURCES: "jobicy,wwr,hn" }).names).toEqual([
      "jobicy",
      "wwr",
      "hn",
    ]);
  });

  it("parses Remotive's public RSS job details and preserves source attribution", () => {
    const jobs = parseRemotiveFeed(`<?xml version="1.0"?>
      <rss><channel><item>
        <title>Freelance Copywriter</title>
        <jobId>1749306</jobId>
        <company>Coalition Technologies</company>
        <location>Worldwide</location>
        <guid isPermaLink="false">https://remotive.com/remote-jobs/writing/freelance-copywriter-1749306</guid>
        <link>https://remotive.com/remote-jobs/writing/freelance-copywriter-1749306</link>
        <category>Writing</category>
        <description>&lt;p&gt;Write SEO landing pages and website copy in different brand voices.&lt;/p&gt;</description>
      </item></channel></rss>`);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: "Freelance Copywriter",
      company: "Coalition Technologies",
      source: "remotive",
      remote: true,
    });
    expect(jobs[0].description).toContain("SEO landing pages");
    expect(jobs[0].url).toContain("remotive.com");
  });
});

describe("rankAndSelect", () => {
  it("returns all configured target role families from the offline fixture source", async () => {
    const jobs = await stubSource.fetchJobs();
    expect(rankAndSelect(jobs).map((match) => match.roleFamily).sort()).toEqual([
      "Content Strategist",
      "Copywriter",
      "Creative Strategist",
      "Email/Lifecycle Marketing",
    ]);
  });

  it("caps each company at two roles", () => {
    const jobs = Array.from({ length: 6 }, (_, i) =>
      job({ id: `test:${i}`, company: "Acme", title: `Copywriter ${i}`, url: `https://example.com/${i}` })
    );
    const picked = rankAndSelect(jobs, 10);
    expect(picked.length).toBe(2);
  });

  it("orders by score", () => {
    const strong = job({ id: "test:strong", url: "https://example.com/s" });
    const weak = job({
      id: "test:weak",
      description: "Write copy for landing pages.",
      url: "https://example.com/w",
    });
    const picked = rankAndSelect([weak, strong], 10);
    expect(picked[0].id).toBe("test:strong");
  });
});

describe("deduplicateJobs", () => {
  it("collapses the same posting reached through two feeds", () => {
    const a = job({ id: "a:1", url: "https://example.com/jobs/1", company: "Acme", title: "Copywriter" });
    const b = job({ id: "b:1", url: "https://example.com/jobs/1/", company: "Acme", title: "Copywriter" });
    expect(deduplicateJobs([a, b]).length).toBe(1);
  });

  it("collapses near-identical company and title", () => {
    const a = job({ id: "a:1", url: "https://a.example/1", company: "Acme Inc", title: "Copywriter" });
    const b = job({ id: "b:1", url: "https://b.example/1", company: "Acme Inc.", title: "Copywriter" });
    expect(deduplicateJobs([a, b]).length).toBe(1);
  });

  it("keeps genuinely different roles", () => {
    const a = job({ id: "a:1", url: "https://a.example/1", company: "Acme", title: "Copywriter" });
    const b = job({ id: "b:1", url: "https://b.example/1", company: "Globex", title: "Copywriter" });
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
