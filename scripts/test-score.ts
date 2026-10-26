import "dotenv/config";
import { fetchAllSources } from "../src/clients/registry.js";
import { deduplicateJobs } from "../src/dedupe.js";
import { scoreJob } from "../src/score.js";
import type { ScoredJob } from "../src/score.js";

async function main() {
  const limit = Number(process.argv[2] ?? 25);
  const { jobs, report } = await fetchAllSources();
  const unique = deduplicateJobs(jobs);

  const scored: ScoredJob[] = [];
  for (const job of unique) {
    const result = scoreJob(job);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => b.score - a.score);

  console.log("=== SCORE PREVIEW (nothing is sent) ===");
  console.log(`Sources: ${report.map((r) => `${r.source}:${r.count}`).join("  ")}`);
  console.log(`Fetched ${jobs.length} | unique ${unique.length} | pass ${scored.length}`);
  console.log("");

  for (const job of scored.slice(0, limit)) {
    console.log(`[${job.score}] ${job.title}`);
    console.log(`      ${job.company ?? "?"} | ${job.location ?? "(none)"} | ${job.source}`);
    console.log(`      ${job.reasons.join(", ")}`);
    console.log(`      ${job.url}`);
  }

  const bySource = new Map<string, number>();
  for (const job of scored) {
    const key = job.source.split(":")[0];
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }
  console.log("");
  console.log(`Pass by source: ${[...bySource.entries()].map(([k, v]) => `${k}:${v}`).join("  ")}`);
}

main().catch((err) => {
  console.error("Score preview failed:", err);
  process.exit(1);
});
