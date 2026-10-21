# VibeSync — Cultural Discovery Concierge

**Problem statement.** Taste is cultural, but most recommendation products reduce
it to a genre or a star rating. VibeSync uses Qloo's taste graph to connect the
music, films, books, podcasts, and aesthetics a person already loves to real
world decisions — where to go, how to light a room, what to eat when texture and
sodium matter, and where to find a community that fits how you process the world.

## Four lateral modes

| Mode | What it produces |
| --- | --- |
| 🌆 **City Vibe** | Culturally matched local dining, coffee, record shops, and hangouts in the user's city |
| 💡 **Space & Lighting** | Buildable lighting specs from film/music/brand taste: Kelvin, CRI, lumens, fixtures, layers, controls, mood zones |
| 🍲 **Care & Sensory Dining** | Cultural nostalgia plus practical needs: soft textures, low sodium, quiet acoustics, low-heat delivery |
| 🧭 **Support & Community** | Communities, information formats, and low-pressure next steps matched to books, podcasts, and films |

## How it works

Every request runs the same deterministic pipeline — no model-driven tool
orchestration, no brittle function calling:

1. **Extract cultural entities** from the message (heuristic pass + one
   structured LLM pass for unfamiliar names). Cities and dietary/sensory needs
   are never treated as tastes.
2. **Resolve them with Qloo** using the official harness workflow contracts
   (`qloo_describe`, `qloo_find_tags`, `qloo_recommend`; `qloo_rank` when a
   shortlist is supplied).
3. **Derive an aggregate Cultural Taste Vector** from resolved entities, Qloo
   tag concepts, and the cultural tags of returned places.
4. **Synthesize for the active mode** with a strict JSON contract:
   `top_recommended_place`, `cultural_anchors`, `vibe_match_score`,
   `practical_specs`, `explanation`.

See [docs/QLOO_INTEGRATION.md](docs/QLOO_INTEGRATION.md) for the exact result
envelope, provenance, submission-guide coverage, and safe-use rules.

## Setup

Requires Node.js 22.19+.

```sh
npm install
cp .env.example .env.local
```

Set the following **server-side** values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `QLOO_API_KEY` | Event-issued Qloo credential. Never commit it, log it, or expose it to the browser. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI Studio key for Gemini 3 Flash (preview; synthesis + entity extraction). |
| `QLOO_API_URL` | Optional. Defaults to `https://hackathon.api.qloo.com`. |

```sh
npm run dev
```

## Verification

```sh
npx tsc --noEmit          # type safety
npx next build            # production build
node scripts/test-modes.mjs             # live 4-mode smoke test
npx tsx scripts/inspect-qloo-workflows.mts  # harness envelope contract check
```

The workflow check asserts `schema_version`, `operation`, `status`,
`execution.transport`, `execution.correlation_id`, `result_count`, and
`provenance` on all four workflows, then prints a redacted summary.

## Safe use

Qloo results describe **aggregate cultural affinities**, not personal identity.
VibeSync does not infer health, politics, religion, finances, ethnicity, age, or
eligibility for high-impact decisions. The UI labels affinities as aggregate,
and the agent prompt forbids identity claims, causal claims, and probability
statements about an individual. Care and Support modes state that practical
guidance is not medical advice or crisis care.

Only public cultural entity names and a city string are sent to Qloo. No names,
emails, device identifiers, account IDs, or location histories.

## Known limitations

- Qloo coverage for niche venues varies; sparse live records yield to the
  curated city dataset, and the source is labelled accordingly.
- `qloo_rank` scores are only comparable within one call.
- The direct transport is used on Vercel because `qloo mcp` requires a local
  process. Self-hosted deployments can switch transports without changing
  result shapes.
