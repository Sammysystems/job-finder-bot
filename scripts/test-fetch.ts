import "dotenv/config";
import { fetchAllSources } from "../src/clients/registry.js";
import { SOURCE_NAMES } from "../src/clients/registry.js";

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

  console.log("");
  console.log(`Valid:    ${withTitle}/${total} titles, ${withUrl}/${total} urls`);
  console.log(`Remote:   ${remote}/${total}`);
  console.log(`Unique:   ${uniqueUrls} distinct urls (${total - uniqueUrls} cross-source duplicates)`);

  if (report.some((r) => r.error)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fetch test failed:", err);
  process.exit(1);
});
