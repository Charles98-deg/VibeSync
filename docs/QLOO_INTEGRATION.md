# Qloo Integration — Workflows, Provenance, and Safe Use

VibeSync uses the official Qloo hackathon surface (`@qloo/qloo-harness`
≥ 0.1.26) and mirrors its validated workflow contracts and result envelopes.

## Why direct HTTP on Vercel

The kit supports `qloo explore`, `qloo exec`, `qloo api`, and `qloo mcp`.
`qloo mcp` starts a local stdio process, which is not a supported serverless
route. VibeSync therefore uses the **direct transport** — the same validated
GET requests `qloo api` / `qloo exec` make — against
`https://hackathon.api.qloo.com`, with the event credential kept server-side in
`QLOO_API_KEY`.

`execution.transport` is `"direct"` and
`execution.transport_name` is `"VibeSync direct Qloo API (Vercel)"`. The rest of
the envelope is identical to the harness.

## Workflows used

| Harness workflow | VibeSync implementation | When it runs |
| --- | --- | --- |
| `qloo_describe` | `describeEntity()` — resolve each named taste via `/search`, return only Qloo metadata + a resolution report | Every request with cultural entities |
| `qloo_find_tags` | `findQlooTags()` — semantic search of the tag ontology via `/v2/tags` | Once per request, for the Taste Vector's concept layer |
| `qloo_recommend` | `discoverRecommendations()` — one combined entity/location/tag profile via `/v2/insights` | Every request with at least one resolved signal |
| `qloo_rank` | `rankShortlist()` — rank a caller-supplied option set via `/v2/insights` (`filter.results.entities`) | Only when the API caller supplies ≥ 2 options, so scores stay comparable and quota is not spent redundantly |

The per-request resolution cache means `describe` → `recommend` performs one
`/search` per taste, not two. No CLI subprocess, no MCP process, no scraping.

## Envelope shape

Every workflow returns:

```json
{
  "schema_version": "1.0-preview.1",
  "operation": "recommend",
  "status": "ok",
  "interpretation": { "target_type": "urn:entity:place", "signals": [] },
  "resolution": {
    "contract_version": "1.0-preview.1",
    "provider": {
      "provider_id": "qloo-search-direct",
      "entity_strategy": "qloo_search_exact_then_semantic",
      "remote": true,
      "uses_model": false,
      "fallback": "none"
    },
    "outcomes": []
  },
  "results": [{ "entity_id": "…", "name": "…", "type": "urn:entity:place" }],
  "result_count": 10,
  "warnings": [],
  "execution": {
    "transport": "direct",
    "transport_name": "VibeSync direct Qloo API (Vercel)",
    "correlation_id": "…",
    "duration_ms": 412
  },
  "provenance": {
    "source": "Qloo API",
    "endpoint": "/v2/insights",
    "documentation": "https://docs.qloo.com/reference/insights-api-deep-dive",
    "requests": [{ "method": "GET", "path": "/v2/insights", "query": { "…": "…" } }]
  }
}
```

Failures use the same envelope with `status: "error"` and
`error: { code, layer, retryable, recovery }`. Unresolvable entities return
`status: "needs_input"` plus a resolution report, rather than a guessed match.

Run the live contract check:

```sh
npx tsx scripts/inspect-qloo-workflows.mts
```

It asserts every required envelope field for all four workflows and prints a
redacted summary (names, counts, endpoints — no credential).

## Submission-guide coverage

| Required item | Where it lives |
| --- | --- |
| Product problem statement | README + the four lateral modes (city, lighting, care dining, support) |
| Workflows used and why | This document, table above |
| Redacted request-to-result explanation | This document + `scripts/inspect-qloo-workflows.mts` output |
| Demo/screenshots without credentials or personal data | Demo uses the seeded sample prompts; no credential is rendered client-side |
| Clean-environment setup | README setup + `.env.example` placeholders |
| Known limitations | This document, below |

## Safe-use rules we enforce

Qloo results describe **aggregate cultural and taste affinities**. VibeSync
never treats them as facts about a person.

- **No identity or sensitive-trait inference.** The agent prompt forbids using
  Qloo output to infer identity, health/diagnosis, politics, religion,
  ethnicity, finances, sexuality, age, or eligibility for housing, employment,
  credit, or insurance.
- **Aggregate language only.** Copy says "aggregate cultural affinity — a signal
  overlap, not a personal profile, prediction, or diagnosis." The agent must say
  "the taste graph associates…" / "people who share these signals tend to…",
  never "Qloo knows you" or "you are…".
- **No causal claims.** Recommendations are framed as alignment/association, not
  proof or probability about an individual.
- **Source separation.** The prompt distinguishes live Qloo evidence from
  VibeSync's interpretation, and forbids claiming live Qloo data when the
  retrieval source is `vibesync-curated`.
- **Minimal data.** Only public cultural entity names (artist, film, book,
  podcast, brand, aesthetic) and a city string are sent. No names, emails,
  device IDs, account IDs, or location histories.
- **Clarify before materially changing a result.** Ambiguous or unresolved
  entities produce `needs_input` with alternatives.
- **No medical advice.** Care and Support modes explicitly state that practical
  guidance is not medical advice, diagnosis, or crisis care, and point to
  professional/emergency support.
- **Untrusted input boundary.** Qloo output, project files, and model output are
  treated as data, never instructions. Credentials stay out of prompts, logs,
  client bundles, and recordings.

## Known limitations

- `qloo_rank` scores are only comparable within a single call; VibeSync never
  compares scores across calls.
- Qloo coverage for very niche or non-Western venues can be sparse. When live
  results lack enough written evidence, VibeSync leads with its curated city
  dataset and labels the source accordingly.
- Direct transport cannot use `qloo mcp` locally; contributors running the MCP
  server can swap the transport without changing result shapes.
- Cached resolutions live for one request only. No user profiles are persisted.
