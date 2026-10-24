import "dotenv/config";
import { jobFinderWorkflow } from "./workflows/job-finder.workflow.js";
import { selectedSourceNames } from "./clients/registry.js";

async function main() {
  const mode = (process.env.JOB_SOURCE ?? "").toLowerCase();
  const target =
    mode === "stub"
      ? "stub fixtures (JOB_SOURCE=stub)"
      : selectedSourceNames().names.join(", ");
  console.log("=== JOB FINDER BOT ===");
  console.log(`Sources: ${target}`);
  console.log("");

  const execution = await jobFinderWorkflow.run({});

  if (execution.status === "error") {
    console.error("Workflow failed:", execution.error);
    process.exit(1);
  }

  const summary = execution.result;
  if (!summary) {
    console.log("No result returned.");
    return;
  }

  console.log(`Fetched:   ${summary.fetched}`);
  console.log(`Matched:   ${summary.matched}`);
  console.log(`New:       ${summary.newJobs}`);
  console.log(`Notified:  ${summary.notified}`);
  console.log(`Sources:   ${summary.sources.join(", ") || "(none)"}`);

  if (summary.matches.length > 0) {
    console.log("\nNew matches:");
    for (const m of summary.matches) {
      console.log(`- ${m.title}${m.company ? ` @ ${m.company}` : ""}${m.location ? ` (${m.location})` : ""}`);
      console.log(`  ${m.url}`);
    }
  }

  // VoltAgent keeps handles open; let sockets settle, then leave.
  await new Promise((resolve) => setTimeout(resolve, 300));
  process.exit(0);
}

main().catch((err) => {
  console.error("Job finder failed:", err);
  process.exit(1);
});
