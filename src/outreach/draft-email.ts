import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job } from "../types.js";
import { matchTargetRole } from "../score.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.resolve(HERE, "../../profile/outreach.json");

interface OutreachProfile {
  sender?: { name?: string };
  relevantExperience?: string;
  portfolioUrl?: string;
}

function loadProfile(): OutreachProfile {
  if (!fs.existsSync(PROFILE_PATH)) {
    return { sender: { name: process.env.SENDER_NAME || "Your Name" } };
  }

  try {
    return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")) as OutreachProfile;
  } catch (error) {
    throw new Error(`Could not read outreach profile at ${PROFILE_PATH}`, { cause: error });
  }
}

function findEvidenceSentence(job: Job, evidence: string[]): string {
  const sentences = (job.description || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const match = sentences.find((sentence) =>
    evidence.some((term) => sentence.toLowerCase().includes(term.toLowerCase()))
  );
  const excerpt = match || `The role emphasizes ${evidence.join(" and ")}.`;
  return excerpt.length > 320 ? `${excerpt.slice(0, 317).trimEnd()}...` : excerpt;
}

export function draftColdEmail(job: Job): { subject: string; body: string } {
  const match = matchTargetRole(job);
  if (!match) {
    throw new Error(`Cannot prepare an application draft for an out-of-scope role: ${job.title}`);
  }

  const profile = loadProfile();
  const company = job.company || "[Company]";
  const title = job.title.trim();
  const experience =
    profile.relevantExperience?.trim() ||
    "[Add one truthful example of relevant work and the result you achieved.]";
  const portfolio =
    profile.portfolioUrl?.trim() || "[Add a relevant portfolio or work-sample link.]";

  return {
    subject: `Application: ${title} at ${company}`,
    body: `Hello ${company} hiring team,

I'm applying for the ${title} role. Your posting highlights: "${findEvidenceSentence(job, match.evidence)}"

Relevant experience: ${experience}

Work sample: ${portfolio}

Regards,
${profile.sender?.name?.trim() || process.env.SENDER_NAME || "Your Name"}`,
  };
}
