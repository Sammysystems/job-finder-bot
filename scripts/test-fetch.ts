import "dotenv/config";
import { fetchAllSources } from "../src/clients/registry.js";
import { SOURCE_NAMES } from "../src/clients/registry.js";
import { scoreJob } from "../src/score.js";
import { TARGET_ROLE_FAMILIES } from "../src/config/keywords.js";

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width, " ");
}

async function main() {
  const started = Date.now();
  const { jobs, report, unknown } = await fetchAllSources();
  const elapsed = Date.now() - started;

  console.log("=== FETCH TEST ===");
  console.log(`Enabled: ${report.map((r) => r.source).join(", ") || "(none)"}`);
  if (unknown.length) console.log(`Unknown: ${unknown.join(", ")}`);
  console.log("");

  const nameWidth = Math.max(12, ...SOURCE_NAMES.map((n) => n.length)) + 2;

  for (const row of report) {
    const label = pad(row.source, nameWidth);
    const count = String(row.count).padStart(6);
    const time = `${row.ms}ms`.padStart(8);
    console.log(`${label}${count}  ${time}${row.error ? `   FAILED: ${row.error}` : ""}`);
  }

  const ok = report.filter((r) => !r.error).length;
  const total = jobs.reduce((sum, _job) => sum + 1, 0);
  console.log("-".repeat(nameWidth + 28));
  console.log(`${pad("TOTAL", nameWidth)}${String(total).padStart(6)}  ${`${elapsed}ms`.padStart(8)}   (${ok}/${report.length} sources ok)`);

  const withUrl = jobs.filter((job) => /^https?:\/\//i.test(job.url)).length;
  const withTitle = jobs.filter((job) => job.title.trim().length > 0).length;
  const remote = jobs.filter((job) => job.remote).length;
  const uniqueUrls = new Set(jobs.map((job) => job.url)).size;
  const matches = jobs.flatMap((job) => {
    const match = scoreJob(job);
    return match ? [match] : [];
  });
  const titleCandidates = jobs.filter((job) =>
    TARGET_ROLE_FAMILIES.some((family) =>
      family.titlePatterns.some((pattern) => job.title.toLowerCase().includes(pattern))
    )
  );

  console.log("");
  console.log(`Valid:    ${withTitle}/${total} titles, ${withUrl}/${total} urls`);
  console.log(`Remote:   ${remote}/${total}`);
  console.log(`Unique:   ${uniqueUrls} distinct urls (${total - uniqueUrls} cross-source duplicates)`);
  console.log(`Role-qualified: ${matches.length}`);
  for (const match of matches) {
    console.log(`- ${match.roleFamily}: ${match.title} @ ${match.company || "Unknown"} [${match.source}]`);
    console.log(`  Evidence: ${match.matchedTerms.join(", ")}`);
    console.log(`  ${match.url}`);
  }
  console.log(`Title candidates checked: ${titleCandidates.length}`);
  for (const candidate of titleCandidates) {
    const match = scoreJob(candidate);
    console.log(
      `- ${match ? "ACCEPTED" : "REJECTED"}: ${candidate.title} @ ${candidate.company || "Unknown"} [${candidate.source}]`
    );
    if (!match) {
      const family = TARGET_ROLE_FAMILIES.find((item) =>
        item.titlePatterns.some((pattern) => candidate.title.toLowerCase().includes(pattern))
      );
      const evidence = family?.evidenceGroups.map((group) =>
        group.find((signal) => (candidate.description ?? "").toLowerCase().includes(signal))
      ) ?? [];
      const evidenceCount = evidence.filter(Boolean).length;
      console.log(
        `  Role evidence: ${evidenceCount}/${family?.minimumEvidenceGroups ?? 0} groups${
          evidenceCount ? ` (${evidence.filter(Boolean).join(", ")})` : ""
        }`
      );
      console.log(`  Location: ${candidate.location || "(none)"}; description length: ${candidate.description?.length ?? 0}`);
      console.log(`  Description: ${(candidate.description || "").replace(/\s+/g, " ").slice(0, 240)}`);
      console.log(`  ${candidate.url}`);
    }
  }

  if (report.some((r) => r.error)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fetch test failed:", err);
  process.exit(1);
});
