import type { Job } from "./types.js";

/**
 * Where a role can actually be done from. "Everywhere" is the policy, but a
 * US-only remote role and a worldwide remote role are not equally winnable from
 * Lagos, so the brief ranks them differently instead of hiding either.
 */
export type EligibilityTier = "worldwide" | "africa" | "open" | "emea" | "apac" | "latam" | "usa" | "onsite";

export interface Eligibility {
  tier: EligibilityTier;
  label: string;
  /** True when the listing is explicitly on-site or hybrid only. */
  onsite: boolean;
}

const ONSITE = /\b(on-?site|in[- ]office|hybrid|in office)\b/i;
const REMOTE = /\b(remote|wfh|work from home|distributed|telecommute|anywhere)\b/i;
const WORLD = /\b(worldwide|world[- ]wide|anywhere|global|international)\b/i;
const AFRICA = /\b(africa|nigeria|lagos|kenya|nairobi|ghana|accra|south africa|cape town|egypt|cairo)\b/i;
const EMEA =
  /\b(emea|europe|european|eu|european union|uk|united kingdom|germany|netherlands|poland|spain|portugal|france|ireland|sweden|denmark|norway|finland|italy|switzerland|austria|belgium|czech|romania|bulgaria)\b/i;
const USA =
  /\b(usa|u\.s\.|us only|us-based|united states|canada|canadian|north america)\b/i;
const APAC =
  /\b(apac|asia|india|singapore|australia|new zealand|japan|china|philippines|pakistan|vietnam|indonesia|malaysia)\b/i;
const LATAM = /\b(latam|americas|south america|brazil|mexico|argentina|colombia|chile|peru)\b/i;

const RANK_WEIGHT: Record<EligibilityTier, number> = {
  worldwide: 4,
  africa: 4,
  open: 3,
  emea: 2,
  apac: 1.5,
  latam: 1.5,
  usa: 1,
  onsite: 0,
};

export function classifyEligibility(job: Pick<Job, "location" | "title" | "description" | "remote">): Eligibility {
  const text = `${job.location ?? ""} ${job.title ?? ""}`;
  const wide = `${text} ${(job.description ?? "").slice(0, 400)}`;

  const onsite = ONSITE.test(text) && !WORLD.test(text) && !/\bremote\b/i.test(text);
  const remoteWord = REMOTE.test(text) || job.remote === true;

  if (onsite) return { tier: "onsite", label: "Onsite", onsite: true };

  if (WORLD.test(text)) return { tier: "worldwide", label: "Worldwide", onsite: false };
  if (AFRICA.test(text)) return { tier: "africa", label: "Africa", onsite: false };
  if (LATAM.test(text)) return { tier: "latam", label: "LATAM", onsite: false };
  if (APAC.test(text)) return { tier: "apac", label: "APAC", onsite: false };
  if (EMEA.test(text)) return { tier: "emea", label: "EMEA", onsite: false };
  if (USA.test(text)) return { tier: "usa", label: "US/Canada", onsite: false };

  // No region named at all, but the listing is remote: treat as open but rank
  // it below an explicit "worldwide".
  if (remoteWord || WORLD.test(wide)) return { tier: "open", label: "Remote", onsite: false };

  return { tier: "open", label: "Unspecified", onsite: false };
}

export function eligibilityRank(tier: EligibilityTier): number {
  return RANK_WEIGHT[tier];
}

export function isWinnable(eligibility: Eligibility): boolean {
  return !eligibility.onsite;
}
