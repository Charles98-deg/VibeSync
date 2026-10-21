/**
 * Live verification for the harness-compatible Qloo workflows.
 *
 * Runs the same four workflows as `qloo exec` — describe, find_tags, recommend,
 * rank — through the direct HTTP transport used on Vercel, then asserts the
 * envelope shape and prints a compact, redacted result summary.
 *
 * Usage: npx tsx scripts/inspect-qloo-workflows.ts
 */
import { readFileSync } from "node:fs";

// Load .env.local before importing the module that reads process.env.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key!]) {
      process.env[key!] = rawValue!.replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env.local is optional; CI can provide real environment variables.
}

const {
  createQlooWorkflowContext,
  describeEntity,
  findQlooTags,
  discoverRecommendations,
  rankShortlist,
  QLOO_RESULT_SCHEMA_VERSION,
} = await import("../lib/qloo");

const STATUSES = new Set([
  "ok",
  "empty",
  "needs_input",
  "partial",
  "degraded",
  "error",
]);

let failures = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

function checkEnvelope(label: string, result: Record<string, unknown>) {
  console.log(`\n=== ${label} ===`);
  assert(result.schema_version === QLOO_RESULT_SCHEMA_VERSION, "schema_version");
  assert(typeof result.operation === "string", "operation");
  assert(STATUSES.has(String(result.status)), `status (${String(result.status)})`);
  const execution = result.execution as Record<string, unknown> | undefined;
  assert(execution?.transport === "direct", "execution.transport = direct");
  assert(typeof execution?.transport_name === "string", "execution.transport_name");
  assert(typeof execution?.correlation_id === "string", "execution.correlation_id");
  assert(typeof execution?.duration_ms === "number", "execution.duration_ms");
  assert(Array.isArray(result.results), "results is an array");
  assert(
    typeof result.result_count === "number",
    `result_count = ${String(result.result_count)}`,
  );
  if (result.error) {
    const error = result.error as Record<string, unknown>;
    assert(
      typeof error.code === "string" &&
        typeof error.recovery === "string" &&
        typeof error.retryable === "boolean",
      `error envelope (${String(error.code)})`,
    );
  }
  const provenance = result.provenance as Record<string, unknown> | undefined;
  if (provenance) {
    assert(provenance.source === "Qloo API", "provenance.source = Qloo API");
    assert(typeof provenance.endpoint === "string", "provenance.endpoint");
  }
  console.log(
    JSON.stringify(
      {
        operation: result.operation,
        status: result.status,
        result_count: result.result_count,
        endpoint: provenance?.endpoint,
        results: (result.results as Array<Record<string, unknown>>)
          ?.slice(0, 5)
          .map((item) => item.name ?? item.id),
        warnings: result.warnings,
        summary: result.summary,
      },
      null,
      2,
    ),
  );
}

const context = createQlooWorkflowContext();

const describe = await describeEntity(
  { entity: "Sade", category: "music" },
  context,
);
checkEnvelope("qloo_describe", describe);

const tags = await findQlooTags(
  { query: "warm amber jazz lounge atmosphere", semantic: true, limit: 5 },
  context,
);
checkEnvelope("qloo_find_tags", tags);

const recommend = await discoverRecommendations(
  {
    target_type: "place",
    signals: [
      { name: "Wong Kar-wai", category: "film" },
      { name: "Sade", category: "music" },
    ],
    signal_location: "London",
    filter_location: "London",
    limit: 10,
  },
  context,
);
checkEnvelope("qloo_recommend", recommend);

const options = (recommend.results ?? [])
  .map((entity) => entity.name)
  .filter(Boolean)
  .slice(0, 2);
if (options.length >= 2) {
  const rank = await rankShortlist(
    {
      options,
      option_type: "place",
      signals: [{ name: "Sade", category: "music" }],
      signal_location: "London",
    },
    context,
  );
  checkEnvelope("qloo_rank", rank);
} else {
  console.log("\n(skipping qloo_rank — recommend returned fewer than 2 resolved options)");
}

console.log(
  `\n${failures === 0 ? "All workflow envelopes match the harness contract." : `${failures} contract check(s) failed.`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
