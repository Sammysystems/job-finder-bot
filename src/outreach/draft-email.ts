import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job } from "../types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOS_PATH = path.resolve(HERE, "../../github-repos.json");
const PROFILE_PATH = path.resolve(HERE, "../../profile/outreach.json");

interface Repo {
  name: string;
  html_url: string;
  description: string;
  language: string;
  updated_at: string;
}

interface OutreachProfile {
  sender: { name: string; github: string; githubUsername: string; email: string };
  prioritizeRepos: string[];
  avoidRepos: string[];
  rules: any;
}

function loadRepos(): Repo[] {
  try {
    if (!fs.existsSync(REPOS_PATH)) return [];
    const raw = fs.readFileSync(REPOS_PATH, "utf8");
    const clean = raw.replace(/^\uFEFF/, "");
    return JSON.parse(clean) as Repo[];
  } catch {
    return [];
  }
}

function loadProfile(): OutreachProfile {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      const raw = fs.readFileSync(PROFILE_PATH, "utf8");
      const clean = raw.replace(/^\uFEFF/, "");
      return JSON.parse(clean);
    }
  } catch {}
  return {
    sender: {
      name: process.env.SENDER_NAME || "AI Automation Engineer",
      github: process.env.SENDER_GITHUB || "https://github.com/Sammysystems",
      githubUsername: "Sammysystems",
      email: "",
    },
    prioritizeRepos: ["proofgate", "outbound-campaign", "dmi-concierge", "lead-followup", "realestate-portal", "instant-quote", "clearsmile-patient-reactivation"],
    avoidRepos: ["website-builder-setup", "Sammysystems"],
    rules: {}
  } as any;
}

function pickRepo(job: Job): Repo | null {
  const profile = loadProfile();
  const repos = loadRepos().filter(r => !profile.avoidRepos?.includes(r.name));
  if (repos.length === 0) return null;
  const haystack = `${job.title} ${job.description || ""}`.toLowerCase();

  const scored = repos.map(repo => {
    let score = 0;

    if (haystack.includes("outbound") || haystack.includes("lead") || haystack.includes("follow") || haystack.includes("crm")) {
      if (repo.name === "outbound-campaign") score += 12;
      if (repo.name === "lead-followup") score += 11;
    }

    if (haystack.includes("workflow") || haystack.includes("automation") || haystack.includes("automate") || haystack.includes("agent") || haystack.includes("handoff") || haystack.includes("integrat")) {
      if (repo.name === "outbound-campaign") score += 10;
      if (repo.name === "dmi-concierge") score += 9;
    }

    if (haystack.includes("ai") || haystack.includes("llm") || haystack.includes("agentic")) {
      if (repo.name === "proofgate") score += 12;
    }

    if (haystack.includes("payment") || haystack.includes("verify") || haystack.includes("receipt") || haystack.includes("checkout")) {
      if (repo.name === "proofgate") score += 12;
    }

    if (haystack.includes("booking") || haystack.includes("appointment")) {
      if (repo.name === "dmi-concierge") score += 10;
    }

    if (haystack.includes("quote") || haystack.includes("pricing")) {
      if (repo.name === "instant-quote") score += 10;
    }

    if (profile.prioritizeRepos?.includes(repo.name)) score += 2;
    return { repo, score };
  });

  scored.sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score > 0) return scored[0].repo;
  
  if (haystack.includes("ai") || haystack.includes("agent")) return repos.find(r => r.name === "proofgate") || repos[0];
  if (haystack.includes("lead") || haystack.includes("outbound")) return repos.find(r => r.name === "outbound-campaign") || repos[0];
  if (haystack.includes("workflow") || haystack.includes("automation")) return repos.find(r => r.name === "outbound-campaign") || repos[0];
  
  return repos.find(r => r.name === "outbound-campaign") || repos[0];
}

function getRelevantRepoContext(repo: Repo | null): string {
  if (!repo) return "the kind of work that takes messy processes and makes them run reliably without adding headcount.";
  
  if (repo.name === "outbound-campaign") {
    return "the kind of work I've done building outbound-campaign to automate follow-up sequences so leads don't slip through, especially when timing and consistency matter.";
  } else if (repo.name === "proofgate") {
    return "the kind of work I've done building proofgate to automate verification and gating logic so teams can trust critical actions without manual checks.";
  } else if (repo.name === "dmi-concierge") {
    return "the kind of work I've done building dmi-concierge to connect fragmented booking flows into one path that just works for both sides.";
  } else if (repo.name === "lead-followup") {
    return "the kind of work I've done building lead-followup to enforce follow-up on a schedule so opportunities don't go cold from inaction.";
  } else if (repo.name === "realestate-portal") {
    return "the kind of work I've done building realestate-portal to automate the tracking and follow-up that otherwise pulls agents into admin all day.";
  } else if (repo.name === "instant-quote") {
    return "the kind of work I've done building instant-quote to turn complex quote forms into instant responses without sacrificing accuracy.";
  } else {
    return `the kind of work I've done on ${repo.name} to turn manual steps into automated flows that save real time.`;
  }
}

export function draftColdEmail(job: Job): { subject: string; body: string; repo: Repo | null } {
  const profile = loadProfile();
  const repo = pickRepo(job);
  const company = job.company || "[Company]";
  const title = (job.title || "").trim();
  const desc = job.description || "";
  const descLower = desc.toLowerCase();
  
  // Paragraph 1: Industry/problem analysis
  let p1 = "";
  if (descLower.includes("ai agent") || descLower.includes("agentic") || descLower.includes("llm") || title.toLowerCase().includes("ai")) {
    p1 = `Getting AI out of a demo and into production is where most teams hit a wall. For ${company}, the challenge isn't just building a capable model or agent, it's connecting it to the tools, data, and workflows your team already relies on. Without the right glue between systems, even the best AI stays stuck in a notebook. This is where I come in.`;
  } else if (descLower.includes("workflow") || descLower.includes("automation") || descLower.includes("integrat") || descLower.includes("api") || descLower.includes("handoff")) {
    p1 = `As ${company} scales, the small handoffs between tools start adding up. What works with a few deals, tickets, or leads becomes a bottleneck once volume grows. The difference between a team that keeps up and one that drowns is usually not more people, but fewer manual steps. This is where I come in.`;
  } else if (descLower.includes("lead") || descLower.includes("outbound") || descLower.includes("crm") || descLower.includes("sales")) {
    p1 = `For companies like ${company}, speed to follow-up often matters more than volume of leads. But without a system enforcing it, good opportunities go cold while the team is busy on other things. Keeping that follow-up consistent without adding headcount is harder than it looks. This is where I come in.`;
  } else if (descLower.includes("payment") || descLower.includes("checkout") || descLower.includes("verify") || descLower.includes("compliance")) {
    p1 = `In areas where verification matters, ${company} can't afford to cut corners, but checking everything manually doesn't scale. The real challenge is making those checks automatic without breaking the flow for legitimate users or adding friction where it shouldn't be. This is where I come in.`;
  } else {
    p1 = `Most growing teams at ${company} reach a point where the processes that got them here start slowing them down. The work that used to take five minutes now takes fifty, and it scales linearly with headcount. Fixing those bottlenecks before they become expensive is usually the highest leverage thing to do. This is where I come in.`;
  }
  
  // Paragraph 2: Credentials/experience
  const repoCtx = getRelevantRepoContext(repo);
  const p2 = `I am an AI automation engineer who builds systems to solve exactly this. I focus on connecting APIs, wiring workflows, and turning manual processes into reliable automations that run in the background. I've done ${repoCtx} The goal is always the same: remove the step, not add another tool for someone to remember.`;
  
  // Paragraph 3: Proposal + close
  let p3 = "";
  if (descLower.includes("ai agent") || descLower.includes("agentic") || title.toLowerCase().includes("ai")) {
    p3 = `I'd start by looking at one specific workflow you're trying to automate for this role - the one you'd want running first if you had an extra engineer this week. I'd map the triggers, data, and edge cases, then propose a concrete plan to make it work reliably. If it's worth building, I can own it end to end. Would you be open to a short conversation to talk through it?`;
  } else if (descLower.includes("integrat") || descLower.includes("api")) {
    p3 = `I'd pick just one integration that's causing the most friction right now and trace it from trigger to result. From there, I'd show you exactly what needs to connect and how to make it reliable without over-engineering. I'd be glad to do that assessment for ${company}. Would you be open to a short conversation this week?`;
  } else if (descLower.includes("lead") || descLower.includes("outbound")) {
    p3 = `I'd look at your current follow-up flow and find where leads are actually falling through - not where you think they are. Then I'd show you a fix you could run with or without me. If it makes sense to have me build it, I'm ready to start. Would you be open to a short call to look at it together?`;
  } else {
    p3 = `I'd start with one painful process tied to this ${title} role and map out how to automate it with the tools you already have. No rebuild, just removing the manual step. If that looks useful, we can take it from there. Would you be open to a short conversation to see if it's a fit?`;
  }
  
  const subject = `${title} at ${company}`;
  const body = `Hi,

${p1}

${p2}

${p3}

— ${profile.sender.name}
${profile.sender.github}`;

  return { subject, body, repo };
}
