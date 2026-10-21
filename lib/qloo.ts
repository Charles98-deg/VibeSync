import { randomUUID } from "node:crypto";

export type CulturalEntity = {
  category: string;
  name: string;
};

/** Normalised shape for a venue, whether it came from Qloo live or a fallback dataset. */
export type QlooPlace = {
  name: string;
  address: string | null;
  category: string;
  rating: number | null;
  description: string;
  reviews: string[];
  google_maps_url: string;
  culturalTags: string[];
  qlooId?: string;
};

// ---------------------------------------------------------------------------
// @qloo/qloo-harness result contract (v0.1.26, schema 1.0-preview.1)
//
// `qloo exec`, `qloo api`, and `qloo mcp` all return one normalized envelope:
//
//   { schema_version, operation, status, summary?, interpretation?,
//     resolution?, results, result_count, warnings?, execution, provenance,
//     error? }
//
// On Vercel there is no local CLI or MCP process, so our transport is
// "direct": the same validated GET requests against hackathon.api.qloo.com.
// The exported workflow functions below mirror the harness exactly for the
// four workflows VibeSync uses: describe, find_tags, recommend, rank.
// ---------------------------------------------------------------------------

export const QLOO_RESULT_SCHEMA_VERSION = "1.0-preview.1" as const;

export type QlooWorkflowTransport = "direct" | "cli" | "mcp";

export type QlooWorkflowStatus =
  | "ok"
  | "empty"
  | "needs_input"
  | "partial"
  | "degraded"
  | "error";

export type QlooRequestPreview = {
  method: "GET";
  path: string;
  query: Record<string, unknown>;
};

export type QlooProvenance = {
  source: string;
  endpoint: string;
  documentation: string;
  transport?: string;
  requests?: QlooRequestPreview[];
};

export type QlooExecution = {
  transport: QlooWorkflowTransport;
  transport_name: string;
  correlation_id: string;
  duration_ms: number;
};

export type QlooWorkflowError = {
  code: string;
  layer: string;
  retryable: boolean;
  recovery: string;
};

/** Compact entity shape emitted by the harness (one item in `results`). */
export type QlooEntityResult = {
  entity_id: string | null;
  name: string;
  type?: string;
  subtype?: string;
  popularity?: number;
  affinity?: number;
  explainability?: unknown;
  properties?: Record<string, unknown>;
};

/** Compact tag shape emitted by the harness (one item in `results`). */
export type QlooTagResult = {
  id: string | null;
  name: string;
  type?: string;
  popularity?: number;
  affinity?: number;
};

export type QlooResolutionProviderDescriptor = {
  contract_version: typeof QLOO_RESULT_SCHEMA_VERSION;
  provider_id: string;
  name: string;
  entity_strategy: string;
  tag_strategy: string;
  remote: boolean;
  uses_model: boolean;
  fallback: "none";
};

export type QlooResolutionProvenance = {
  contract_version: typeof QLOO_RESULT_SCHEMA_VERSION;
  provider_id: string;
  provider_name: string;
  endpoint: string;
  strategy: string;
  remote: boolean;
  uses_model: boolean;
  cache_status?: string;
};

export type QlooResolutionCandidate = {
  id: string;
  name: string;
  type?: string;
  rank?: number;
  score?: number;
  popularity?: number;
  description?: string;
  release_year?: number;
  address?: unknown;
};

export type QlooResolutionOutcome = {
  input: string;
  input_kind: "entity" | "tag";
  status: "resolved" | "ambiguous" | "not_found";
  match?: "identifier" | "exact" | "semantic";
  selected?: QlooResolutionCandidate;
  alternatives?: QlooResolutionCandidate[];
  candidates?: QlooResolutionCandidate[];
  field?: string;
  provenance: QlooResolutionProvenance;
};

export type QlooResolutionReport = {
  contract_version: typeof QLOO_RESULT_SCHEMA_VERSION;
  provider: QlooResolutionProviderDescriptor;
  outcomes: QlooResolutionOutcome[];
  warnings?: string[];
};

/** The normalized envelope returned by every harness workflow. */
export type QlooWorkflowResult<T = unknown> = {
  schema_version: typeof QLOO_RESULT_SCHEMA_VERSION;
  operation: string;
  status: QlooWorkflowStatus;
  summary?: string;
  interpretation?: unknown;
  resolution?: QlooResolutionReport;
  results?: T[];
  result_count?: number;
  warnings?: string[];
  query_intent?: unknown;
  execution: QlooExecution;
  provenance?: QlooProvenance;
  error?: QlooWorkflowError;
};

/**
 * Recommendation result plus the two product-only extensions VibeSync needs:
 * normalized venues for the retrieval prompt and a Cultural Taste Vector.
 * Both are additive fields on the harness envelope, which allows extra keys.
 */
export type QlooRecommendationResult = QlooWorkflowResult<QlooEntityResult> & {
  places: QlooPlace[];
  culturalVector: string[];
};

/** Shared, per-request resolution cache so describe → recommend costs one search per taste. */
export type QlooWorkflowContext = {
  signal?: AbortSignal;
  correlation_id: string;
  cache: Map<string, QlooEntityResult | null>;
};

export function createQlooWorkflowContext(
  options: { signal?: AbortSignal; correlationId?: string } = {},
): QlooWorkflowContext {
  return {
    signal: options.signal,
    correlation_id: options.correlationId ?? randomUUID(),
    cache: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Qloo API configuration
// ---------------------------------------------------------------------------

const DEFAULT_QLOO_API_URL = "https://hackathon.api.qloo.com";

/** Base URL for the Qloo API, configured through the QLOO_API_URL env var. */
export function getQlooApiUrl() {
  const configured = process.env.QLOO_API_URL?.trim();
  return (configured || DEFAULT_QLOO_API_URL).replace(/\/+$/, "");
}

function getQlooApiKey(): string | undefined {
  return process.env.QLOO_API_KEY?.trim() || undefined;
}

/**
 * Qloo entity types per cultural category. Used to make /search resolve the
 * right kind of entity (an artist, not a hotel that happens to share the name).
 */
const CATEGORY_TYPE_HINTS: Record<string, string[]> = {
  music: ["urn:entity:artist", "urn:entity:person"],
  artist: ["urn:entity:artist", "urn:entity:person"],
  film: ["urn:entity:movie", "urn:entity:tv_show"],
  movie: ["urn:entity:movie", "urn:entity:tv_show"],
  fashion: ["urn:entity:brand", "urn:entity:person"],
  brand: ["urn:entity:brand"],
  art: ["urn:entity:person", "urn:entity:artist"],
  food: ["urn:entity:place"],
  // Lateral modes: support & community, and design-forward lighting taste.
  book: ["urn:entity:book", "urn:entity:person"],
  books: ["urn:entity:book", "urn:entity:person"],
  literature: ["urn:entity:book"],
  podcast: ["urn:entity:podcast"],
  podcasts: ["urn:entity:podcast"],
  media: ["urn:entity:podcast", "urn:entity:book"],
  design: ["urn:entity:brand", "urn:entity:person"],
  interior: ["urn:entity:brand", "urn:entity:person"],
  lighting: ["urn:entity:brand"],
  architecture: ["urn:entity:brand", "urn:entity:person"],
  aesthetic: ["urn:entity:brand", "urn:entity:person"],
  aesthetics: ["urn:entity:brand", "urn:entity:person"],
  wellness: ["urn:entity:brand", "urn:entity:place"],
};

const ACCEPTED_SEED_TYPES = [
  "urn:entity:artist",
  "urn:entity:person",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:brand",
  "urn:entity:music",
  "urn:entity:book",
  "urn:entity:podcast",
];

// ---------------------------------------------------------------------------
// Qloo workflow primitives
// ---------------------------------------------------------------------------

const QLOO_DEFAULT_LIMIT = 10;
const QLOO_MAX_RESULTS = 20;
const QLOO_REQUEST_TIMEOUT_MS = 10_000;
const QLOO_TRANSPORT_NAME = "VibeSync direct Qloo API (Vercel)";

/** Harness search-type enum mirrored as alias → URN. */
const QLOO_SEARCH_TYPES: Record<string, string> = {
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  brand: "urn:entity:brand",
  movie: "urn:entity:movie",
  person: "urn:entity:person",
  place: "urn:entity:place",
  podcast: "urn:entity:podcast",
  tv_show: "urn:entity:tv_show",
  videogame: "urn:entity:videogame",
  locality: "urn:entity:locality",
  actor: "urn:entity:actor",
  album: "urn:entity:album",
  author: "urn:entity:author",
  director: "urn:entity:director",
};

const QLOO_SEARCH_TYPE_ALIASES = (() => {
  const aliases = new Map<string, string>();
  for (const [id, urn] of Object.entries(QLOO_SEARCH_TYPES)) {
    aliases.set(id, urn);
    aliases.set(`${id}s`, urn);
    aliases.set(urn, urn);
  }
  const add = (alias: string, id: string) => {
    const urn = QLOO_SEARCH_TYPES[id];
    if (urn) aliases.set(alias, urn);
  };
  add("people", "person");
  add("localities", "locality");
  add("tv", "tv_show");
  add("show", "tv_show");
  add("shows", "tv_show");
  add("tv show", "tv_show");
  add("tv shows", "tv_show");
  add("game", "videogame");
  add("games", "videogame");
  add("video game", "videogame");
  add("video games", "videogame");
  return aliases;
})();

/** Resolve a harness entity-type alias (or URN) to its Qloo URN. */
export function resolveQlooEntityType(value?: string): string | undefined {
  if (!value) return undefined;
  return QLOO_SEARCH_TYPE_ALIASES.get(value.trim().toLowerCase());
}

const RESOLUTION_PROVIDER: QlooResolutionProviderDescriptor = {
  contract_version: QLOO_RESULT_SCHEMA_VERSION,
  provider_id: "qloo-search-direct",
  name: "Qloo /search (direct HTTP)",
  entity_strategy: "qloo_search_exact_then_semantic",
  tag_strategy: "qloo_v2_tags_semantic",
  remote: true,
  uses_model: false,
  fallback: "none",
};

function executionFor(
  context: QlooWorkflowContext,
  startedAt: number,
): QlooExecution {
  return {
    transport: "direct",
    transport_name: QLOO_TRANSPORT_NAME,
    correlation_id: context.correlation_id,
    duration_ms: Math.max(0, Date.now() - startedAt),
  };
}

function resolutionProvenance(endpoint: string): QlooResolutionProvenance {
  return {
    contract_version: QLOO_RESULT_SCHEMA_VERSION,
    provider_id: RESOLUTION_PROVIDER.provider_id,
    provider_name: RESOLUTION_PROVIDER.name,
    endpoint,
    strategy: RESOLUTION_PROVIDER.entity_strategy,
    remote: true,
    uses_model: false,
  };
}

function provenance(
  endpoint: string,
  documentation: string,
  requests: Array<Record<string, unknown>>,
): QlooProvenance {
  return {
    source: "Qloo API",
    endpoint,
    documentation: `https://docs.qloo.com/reference/${documentation}`,
    requests: requests.slice(0, 20).map((query) => ({
      method: "GET",
      path: endpoint,
      query: boundedValue(query) as Record<string, unknown>,
    })),
  };
}

function boundedValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (depth >= 5) return "[detail omitted]";
  if (Array.isArray(value)) {
    return value
      .slice(0, QLOO_MAX_RESULTS)
      .map((item) => boundedValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, item]) => [key, boundedValue(item, depth + 1)]),
    );
  }
  return undefined;
}

type QlooHttpResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: QlooWorkflowError };

/**
 * One validated Qloo GET. Credentials stay server-side; retries are bounded and
 * every failure carries a machine-readable code + recovery guidance, matching
 * the harness error envelope.
 */
async function qlooGet<T>(
  path: string,
  params: URLSearchParams,
  context: QlooWorkflowContext,
): Promise<QlooHttpResponse<T>> {
  const apiKey = getQlooApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "missing_credential",
        layer: "configuration",
        retryable: false,
        recovery:
          "Set QLOO_API_KEY in the server environment (never in client code, a repository file, or a demo recording).",
      },
    };
  }

  try {
    const timeout = AbortSignal.timeout(QLOO_REQUEST_TIMEOUT_MS);
    const signal = context.signal
      ? AbortSignal.any([context.signal, timeout])
      : timeout;
    const response = await fetch(
      `${getQlooApiUrl()}${path}?${params.toString()}`,
      { headers: { "X-Api-Key": apiKey }, signal },
    );

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const authFailed = response.status === 401 || response.status === 403;
      return {
        ok: false,
        error: {
          code: authFailed
            ? "qloo_auth_error"
            : response.status === 429
              ? "qloo_rate_limited"
              : "qloo_api_error",
          layer: "upstream",
          retryable,
          recovery: authFailed
            ? "Confirm QLOO_API_KEY is the event-issued credential and has not expired."
            : retryable
              ? "Retry once after a short pause; if it persists, fall back to curated data and disclose that Qloo was unavailable."
              : "Fall back to curated data and report the upstream failure rather than inventing a result.",
        },
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      error: {
        code: "qloo_network_error",
        layer: "transport",
        retryable: true,
        recovery:
          "Retry once with the bounded timeout; if it still fails, use curated fallback data and disclose it.",
      },
    };
  }
}

/** Qloo sometimes returns `results: [...]` and sometimes `results: { <key>: [...] }`. */
function qlooResultArray(response: unknown, key: string): unknown[] {
  if (!response || typeof response !== "object") return [];
  const results = (response as Record<string, unknown>).results;
  if (Array.isArray(results)) return results;
  if (results && typeof results === "object") {
    const keyed = (results as Record<string, unknown>)[key];
    return Array.isArray(keyed) ? keyed : [];
  }
  return [];
}

type QlooRawEntity = {
  entity_id?: string;
  id?: string;
  name?: string;
  type?: string;
  types?: string[];
  subtype?: string;
  popularity?: number;
  affinity?: number;
  query?: { affinity?: number; explainability?: unknown };
  properties?: Record<string, unknown>;
  address?: unknown;
};

type RawInsightEntity = QlooRawEntity & {
  properties?: QlooInsightEntity["properties"];
};

/** Harness `compactEntity`: only fields Qloo actually returned. */
function compactEntity(value: unknown): QlooEntityResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entity = value as QlooRawEntity;
  if (!entity.name) return undefined;

  const properties = entity.properties ?? {};
  const compactProperties = Object.fromEntries(
    [
      "description",
      "short_description",
      "release_year",
      "release_date",
      "content_rating",
      "duration",
      "image",
      "geocode",
      "address",
      "price_level",
      "business_rating",
    ].flatMap((key) =>
      properties[key] === undefined
        ? []
        : [[key, boundedValue(properties[key])]],
    ),
  );

  return {
    entity_id: entity.entity_id ?? entity.id ?? null,
    name: entity.name,
    ...(entity.type ? { type: entity.type } : entity.types?.[0] ? { type: entity.types[0] } : {}),
    ...(entity.subtype ? { subtype: entity.subtype } : {}),
    ...(typeof entity.popularity === "number"
      ? { popularity: entity.popularity }
      : {}),
    ...(typeof (entity.affinity ?? entity.query?.affinity) === "number"
      ? { affinity: (entity.affinity ?? entity.query?.affinity) as number }
      : {}),
    ...(entity.query?.explainability !== undefined
      ? { explainability: boundedValue(entity.query.explainability) }
      : {}),
    ...(Object.keys(compactProperties).length > 0
      ? { properties: compactProperties }
      : {}),
  };
}

/** Harness `compactTag`. */
function compactTag(value: unknown): QlooTagResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const tag = value as {
    id?: string;
    tag_id?: string;
    name?: string;
    type?: string;
    subtype?: string;
    popularity?: number;
    affinity?: number;
    query?: { affinity?: number };
  };
  if (!tag.name) return undefined;
  return {
    id: tag.id ?? tag.tag_id ?? null,
    name: tag.name,
    ...(tag.type ?? tag.subtype ? { type: tag.type ?? tag.subtype } : {}),
    ...(typeof tag.popularity === "number" ? { popularity: tag.popularity } : {}),
    ...(typeof (tag.affinity ?? tag.query?.affinity) === "number"
      ? { affinity: (tag.affinity ?? tag.query?.affinity) as number }
      : {}),
  };
}

type QlooRawSearchResult = {
  name?: string;
  entity_id?: string;
  id?: string;
  types?: string[];
};

function pickBestSearchResult(
  results: QlooRawSearchResult[],
  wantedName: string,
) {
  const wanted = normalize(wantedName);
  const exact = results.find((result) => normalize(result.name ?? "") === wanted);
  if (exact) return exact;

  const contains = results.find((result) => {
    const name = normalize(result.name ?? "");
    return name.includes(wanted) || wanted.includes(name);
  });
  if (contains) return contains;

  const typed = results.find((result) =>
    (result.types ?? ACCEPTED_SEED_TYPES).some((type) =>
      ACCEPTED_SEED_TYPES.includes(type),
    ),
  );
  return typed ?? results[0];
}

function candidatePayload(entity: QlooEntityResult): QlooResolutionCandidate {
  return {
    id: entity.entity_id ?? entity.name,
    name: entity.name,
    ...(entity.type ? { type: entity.type } : {}),
    ...(typeof entity.popularity === "number"
      ? { popularity: entity.popularity }
      : {}),
  };
}

type ResolvedEntityInput = {
  input: string;
  category?: string;
  selected: QlooEntityResult | null;
  alternatives: QlooEntityResult[];
  outcome: QlooResolutionOutcome;
  error?: QlooWorkflowError;
};

/**
 * Resolve one entity through Qloo `/search`, reusing a per-request cache so the
 * describe → recommend chain pays for exactly one search per taste.
 */
async function resolveEntityInput(
  input: string | { name: string; category?: string; type?: string },
  context: QlooWorkflowContext,
): Promise<ResolvedEntityInput> {
  const name = (typeof input === "string" ? input : input.name).trim();
  const category = typeof input === "string" ? undefined : input.category;
  const explicitType = typeof input === "string" ? undefined : input.type;
  const typeHint = explicitType
    ? resolveQlooEntityType(explicitType) ??
      (explicitType.startsWith("urn:") ? explicitType : undefined)
    : category
      ? CATEGORY_TYPE_HINTS[category.toLowerCase()]?.[0]
      : undefined;
  const cacheKey = `${normalize(name)}::${typeHint ?? "*"}`;

  const cached = context.cache.get(cacheKey);
  if (cached !== undefined) {
    return {
      input: name,
      category,
      selected: cached,
      alternatives: [],
      outcome: cached
        ? resolvedOutcome(name, cached, "exact", [])
        : notFoundOutcome(name),
    };
  }

  const params = new URLSearchParams({ query: name, take: "10" });
  if (typeHint) params.set("filter.type", typeHint);

  const response = await qlooGet<{
    results?: QlooRawSearchResult[];
    entities?: QlooRawSearchResult[];
  }>("/search", params, context);

  if (!response.ok) {
    return {
      input: name,
      category,
      selected: null,
      alternatives: [],
      outcome: notFoundOutcome(name),
      error: response.error,
    };
  }

  const raw = Array.isArray(response.data?.results)
    ? response.data.results
    : Array.isArray(response.data?.entities)
      ? response.data.entities
      : [];
  const candidates = raw.filter(
    (result): result is QlooRawSearchResult & { name: string } =>
      Boolean(result.name?.trim()),
  );
  if (candidates.length === 0) {
    context.cache.set(cacheKey, null);
    return {
      input: name,
      category,
      selected: null,
      alternatives: [],
      outcome: notFoundOutcome(name),
    };
  }

  const best = pickBestSearchResult(candidates, name);
  const selected = compactEntity(best);
  if (!selected) {
    context.cache.set(cacheKey, null);
    return {
      input: name,
      category,
      selected: null,
      alternatives: [],
      outcome: notFoundOutcome(name),
    };
  }

  const alternatives = candidates
    .filter((candidate) => candidate !== best)
    .slice(0, 5)
    .map((candidate) => compactEntity(candidate))
    .filter((candidate): candidate is QlooEntityResult => Boolean(candidate));

  const match =
    normalize(selected.name) === normalize(name) ? "exact" : "semantic";
  context.cache.set(cacheKey, selected);

  return {
    input: name,
    category,
    selected,
    alternatives,
    outcome: resolvedOutcome(name, selected, match, alternatives),
  };
}

function resolvedOutcome(
  input: string,
  selected: QlooEntityResult,
  match: "exact" | "semantic",
  alternatives: QlooEntityResult[],
): QlooResolutionOutcome {
  return {
    input,
    input_kind: "entity",
    status: "resolved",
    match,
    selected: candidatePayload(selected),
    ...(alternatives.length > 0
      ? { alternatives: alternatives.map(candidatePayload) }
      : {}),
    provenance: resolutionProvenance("/search"),
  };
}

function notFoundOutcome(input: string): QlooResolutionOutcome {
  return {
    input,
    input_kind: "entity",
    status: "not_found",
    candidates: [],
    provenance: resolutionProvenance("/search"),
  };
}

function resolutionReport(
  outcomes: QlooResolutionOutcome[],
): QlooResolutionReport {
  return {
    contract_version: QLOO_RESULT_SCHEMA_VERSION,
    provider: RESOLUTION_PROVIDER,
    outcomes,
  };
}

function interpretedEntity(resolved: ResolvedEntityInput) {
  return {
    input: resolved.input,
    entityId: resolved.selected?.entity_id ?? resolved.input,
    name: resolved.selected?.name ?? resolved.input,
    ...(resolved.selected?.type ? { type: resolved.selected.type } : {}),
    match:
      resolved.outcome.status === "resolved"
        ? (resolved.outcome.match ?? "semantic")
        : "semantic",
  };
}

function errorResult(
  operation: string,
  context: QlooWorkflowContext,
  startedAt: number,
  error: QlooWorkflowError,
  extra: { provenance?: QlooProvenance } = {},
): QlooWorkflowResult<never> {
  return {
    schema_version: QLOO_RESULT_SCHEMA_VERSION,
    operation,
    status: "error",
    summary:
      error.code === "missing_credential"
        ? "Qloo credential is not configured."
        : "The Qloo API request failed.",
    results: [],
    result_count: 0,
    execution: executionFor(context, startedAt),
    error,
    ...(extra.provenance ? { provenance: extra.provenance } : {}),
  };
}

function needsInputResult(
  operation: string,
  context: QlooWorkflowContext,
  startedAt: number,
  outcomes: QlooResolutionOutcome[],
  summary: string,
): QlooWorkflowResult<never> {
  return {
    schema_version: QLOO_RESULT_SCHEMA_VERSION,
    operation,
    status: "needs_input",
    summary,
    resolution: resolutionReport(outcomes),
    results: [],
    result_count: 0,
    execution: executionFor(context, startedAt),
  };
}

function uniqueWarnings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

// ---------------------------------------------------------------------------
// Workflow: qloo_describe — resolve one entity and return Qloo metadata only
// ---------------------------------------------------------------------------

export async function describeEntity(
  input: { entity: string; type?: string; category?: string },
  context: QlooWorkflowContext = createQlooWorkflowContext(),
): Promise<QlooWorkflowResult<QlooEntityResult>> {
  const startedAt = Date.now();
  if (!input.entity?.trim()) {
    return needsInputResult(
      "describe",
      context,
      startedAt,
      [],
      "Provide an entity to describe.",
    );
  }

  const resolved = await resolveEntityInput(
    { name: input.entity, category: input.category, type: input.type },
    context,
  );
  if (resolved.error) {
    return errorResult("describe", context, startedAt, resolved.error);
  }
  if (!resolved.selected) {
    return needsInputResult(
      "describe",
      context,
      startedAt,
      [resolved.outcome],
      "Choose the intended Qloo entity.",
    );
  }

  const results: QlooEntityResult[] = [
    {
      entity_id: resolved.selected.entity_id,
      name: resolved.selected.name,
      ...(resolved.selected.type ? { type: resolved.selected.type } : {}),
    },
  ];

  return {
    schema_version: QLOO_RESULT_SCHEMA_VERSION,
    operation: "describe",
    status: "ok",
    interpretation: { entity: interpretedEntity(resolved) },
    resolution: resolutionReport([resolved.outcome]),
    results,
    result_count: results.length,
    execution: executionFor(context, startedAt),
    provenance: provenance("/search", "get-search", [
      {
        query: resolved.input,
        ...(resolved.selected.type ? { "filter.type": resolved.selected.type } : {}),
        take: 10,
      },
    ]),
  };
}

// ---------------------------------------------------------------------------
// Workflow: qloo_find_tags — search the tag ontology by natural-language concept
// ---------------------------------------------------------------------------

export async function findQlooTags(
  input: { query: string; semantic?: boolean; limit?: number },
  context: QlooWorkflowContext = createQlooWorkflowContext(),
): Promise<QlooWorkflowResult<QlooTagResult>> {
  const startedAt = Date.now();
  const semantic = input.semantic ?? true;
  const limit = clampLimit(input.limit);

  if (!input.query?.trim()) {
    return needsInputResult(
      "find_tags",
      context,
      startedAt,
      [],
      "Provide a natural-language tag concept.",
    );
  }

  const params = new URLSearchParams({
    "filter.query": input.query.trim(),
    "feature.semantic_search": String(semantic),
    take: String(limit),
  });
  const response = await qlooGet<unknown>("/v2/tags", params, context);
  if (!response.ok) {
    return errorResult("find_tags", context, startedAt, response.error);
  }

  const results = qlooResultArray(response.data, "tags")
    .map(compactTag)
    .filter((tag): tag is QlooTagResult => Boolean(tag))
    .slice(0, limit);

  return {
    schema_version: QLOO_RESULT_SCHEMA_VERSION,
    operation: "find_tags",
    status: results.length > 0 ? "ok" : "empty",
    interpretation: { query: input.query.trim(), semantic },
    results,
    result_count: results.length,
    execution: executionFor(context, startedAt),
    provenance: provenance("/v2/tags", "get-tags-1", [
      {
        "filter.query": input.query.trim(),
        "feature.semantic_search": semantic,
        take: limit,
      },
    ]),
  };
}

// ---------------------------------------------------------------------------
// Workflow: qloo_recommend — discover entities from a combined taste profile
// ---------------------------------------------------------------------------

export async function discoverRecommendations(
  input: {
    target_type?: string;
    signals?: Array<string | { name: string; category?: string; type?: string }>;
    signal_tags?: string[];
    signal_tags_operator?: "union" | "intersection";
    signal_location?: string;
    filter_location?: string;
    include_tags?: string[];
    include_tags_operator?: "union" | "intersection";
    exclude_tags?: string[];
    exclude_tags_operator?: "union" | "intersection";
    explain?: boolean;
    limit?: number;
    /** Internal: hotel filtering + mood matching in normalizeQlooPlaces. */
    intent?: string;
  },
  context: QlooWorkflowContext = createQlooWorkflowContext(),
): Promise<QlooRecommendationResult> {
  const startedAt = Date.now();
  const targetType =
    resolveQlooEntityType(input.target_type) ?? "urn:entity:place";
  const limit = clampLimit(input.limit);
  const signals = input.signals ?? [];

  const [resolvedSignals, signalTags, includeTags, excludeTags] =
    await Promise.all([
      Promise.all(
        signals.map((signal) => resolveEntityInput(signal, context)),
      ),
      resolveTagInputs(input.signal_tags ?? [], input.signal_tags_operator),
      resolveTagInputs(input.include_tags ?? [], input.include_tags_operator),
      resolveTagInputs(input.exclude_tags ?? [], input.exclude_tags_operator),
    ]);

  const transportError = resolvedSignals.find((signal) => signal.error)?.error;
  if (transportError) {
    return {
      ...errorResult("recommend", context, startedAt, transportError),
      places: [],
      culturalVector: [],
    };
  }

  if (
    signals.length === 0 &&
    signalTags.ids.length === 0 &&
    !input.signal_location
  ) {
    return {
      ...needsInputResult(
        "recommend",
        context,
        startedAt,
        [],
        "Provide at least one entity, tag, or location taste signal.",
      ),
      places: [],
      culturalVector: [],
    };
  }

  const resolvedIds = resolvedSignals
    .map((signal) => signal.selected?.entity_id)
    .filter((id): id is string => Boolean(id));

  if (signals.length > 0 && resolvedIds.length === 0) {
    return {
      ...needsInputResult(
        "recommend",
        context,
        startedAt,
        resolvedSignals.map((signal) => signal.outcome),
        "Choose or correct the unresolved Qloo inputs.",
      ),
      places: [],
      culturalVector: [],
    };
  }

  const warnings = uniqueWarnings([
    ...resolvedSignals
      .filter((signal) => !signal.selected)
      .map(
        (signal) =>
          `Signal "${signal.input}" was not found in Qloo and was left out of this request.`,
      ),
    ...signalTags.warnings,
    ...includeTags.warnings,
    ...excludeTags.warnings,
  ]);

  const query: Record<string, unknown> = {
    "filter.type": targetType,
    take: limit,
  };
  if (resolvedIds.length > 0) query["signal.interests.entities"] = resolvedIds;
  if (signalTags.ids.length > 0) {
    query["signal.interests.tags"] = signalTags.ids;
    query["operator.signal.interests.tags"] =
      input.signal_tags_operator ?? "intersection";
  }
  if (input.signal_location) query["signal.location.query"] = input.signal_location;
  if (input.filter_location) query["filter.location.query"] = input.filter_location;
  if (includeTags.ids.length > 0) {
    query["filter.tags"] = includeTags.ids;
    query["operator.filter.tags"] = input.include_tags_operator ?? "union";
  }
  if (excludeTags.ids.length > 0) {
    query["filter.exclude.tags"] = excludeTags.ids;
    query["operator.filter.exclude.tags"] = input.exclude_tags_operator ?? "union";
  }
  if (input.explain ?? true) query["feature.explainability"] = true;

  const params = toSearchParams(query);
  const response = await qlooGet<unknown>("/v2/insights", params, context);
  if (!response.ok) {
    return {
      ...errorResult("recommend", context, startedAt, response.error, {
        provenance: provenance("/v2/insights", "insights-api-deep-dive", [query]),
      }),
      places: [],
      culturalVector: [],
    };
  }

  const rawEntities = qlooResultArray(response.data, "entities") as RawInsightEntity[];
  const results = rawEntities
    .map(compactEntity)
    .filter((entity): entity is QlooEntityResult => Boolean(entity))
    .slice(0, limit);

  const city = input.filter_location ?? input.signal_location ?? "";
  const places = normalizeQlooPlaces(rawEntities, city, input.intent);

  const seeds: CulturalEntity[] = resolvedSignals.map((signal) => ({
    name: signal.selected?.name ?? signal.input,
    category: signal.category ?? "culture",
  }));
  const culturalVector = buildCulturalVector(seeds, places);

  const explainability = boundedValue(
    (response.data as { query?: { explainability?: unknown } } | undefined)
      ?.query?.explainability,
  );
  const status: QlooWorkflowStatus =
    results.length === 0 ? "empty" : warnings.length > 0 ? "partial" : "ok";

  return {
    schema_version: QLOO_RESULT_SCHEMA_VERSION,
    operation: "recommend",
    status,
    interpretation: {
      target_type: targetType,
      signals: resolvedSignals.map(interpretedEntity),
      signal_tags: signalTags.interpreted,
      signal_tags_operator:
        signalTags.ids.length > 0
          ? (input.signal_tags_operator ?? "intersection")
          : undefined,
      signal_location: input.signal_location,
      filter_location: input.filter_location,
      include_tags: includeTags.interpreted,
      include_tags_operator:
        includeTags.ids.length > 0
          ? (input.include_tags_operator ?? "union")
          : undefined,
      exclude_tags: excludeTags.interpreted,
      exclude_tags_operator:
        excludeTags.ids.length > 0
          ? (input.exclude_tags_operator ?? "union")
          : undefined,
    },
    resolution: resolutionReport(
      resolvedSignals.map((signal) => signal.outcome),
    ),
    results,
    result_count: results.length,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(explainability !== undefined ? { explainability } : {}),
    execution: executionFor(context, startedAt),
    provenance: provenance("/v2/insights", "insights-api-deep-dive", [query]),
    places,
    culturalVector,
  };
}

// ---------------------------------------------------------------------------
// Workflow: qloo_rank — rank a caller-supplied shortlist against one profile
// ---------------------------------------------------------------------------

export async function rankShortlist(
  input: {
    options: Array<string | { name: string; category?: string; type?: string }>;
    option_type?: string;
    signals?: Array<string | { name: string; category?: string; type?: string }>;
    signal_location?: string;
    include_tags?: string[];
    exclude_tags?: string[];
    limit?: number;
  },
  context: QlooWorkflowContext = createQlooWorkflowContext(),
): Promise<QlooWorkflowResult<QlooEntityResult>> {
  const startedAt = Date.now();
  const targetType =
    resolveQlooEntityType(input.option_type) ?? "urn:entity:place";
  const limit = clampLimit(input.limit ?? input.options.length);

  if (!input.options?.length) {
    return needsInputResult(
      "rank",
      context,
      startedAt,
      [],
      "Provide at least one option to rank.",
    );
  }

  const [options, resolvedSignals, includeTags, excludeTags] = await Promise.all([
    Promise.all(
      input.options.map((option) => resolveEntityInput(option, context)),
    ),
    Promise.all(
      (input.signals ?? []).map((signal) => resolveEntityInput(signal, context)),
    ),
    resolveTagInputs(input.include_tags ?? [], "union"),
    resolveTagInputs(input.exclude_tags ?? [], "union"),
  ]);

  const transportError = [...options, ...resolvedSignals].find(
    (resolved) => resolved.error,
  )?.error;
  if (transportError) {
    return errorResult("rank", context, startedAt, transportError);
  }

  const unresolvedOptions = options.filter((option) => !option.selected);
  if (unresolvedOptions.length > 0) {
    return needsInputResult(
      "rank",
      context,
      startedAt,
      unresolvedOptions.map((option) => option.outcome),
      "Choose or correct the unresolved ranking inputs.",
    );
  }

  const unresolvedSignals = resolvedSignals.filter((signal) => !signal.selected);
  if (unresolvedSignals.length > 0) {
    return needsInputResult(
      "rank",
      context,
      startedAt,
      unresolvedSignals.map((signal) => signal.outcome),
      "Choose or correct the unresolved ranking inputs.",
    );
  }

  if (resolvedSignals.length === 0 && !input.signal_location) {
    return needsInputResult(
      "rank",
      context,
      startedAt,
      [],
      "Ranking requires an entity or location signal.",
    );
  }

  const optionIds = options
    .map((option) => option.selected?.entity_id)
    .filter((id): id is string => Boolean(id));
  const signalIds = resolvedSignals
    .map((signal) => signal.selected?.entity_id)
    .filter((id): id is string => Boolean(id));

  const query: Record<string, unknown> = {
    "filter.type": targetType,
    "filter.results.entities": optionIds,
    take: optionIds.length,
  };
  if (signalIds.length > 0) query["signal.interests.entities"] = signalIds;
  if (input.signal_location) query["signal.location.query"] = input.signal_location;
  if (includeTags.ids.length > 0) {
    query["filter.tags"] = includeTags.ids;
    query["operator.filter.tags"] = "union";
  }
  if (excludeTags.ids.length > 0) {
    query["filter.exclude.tags"] = excludeTags.ids;
    query["operator.filter.exclude.tags"] = "union";
  }

  const response = await qlooGet<unknown>(
    "/v2/insights",
    toSearchParams(query),
    context,
  );
  if (!response.ok) {
    return errorResult("rank", context, startedAt, response.error, {
      provenance: provenance("/v2/insights", "insights-api-deep-dive", [query]),
    });
  }

  const results = (qlooResultArray(response.data, "entities") as RawInsightEntity[])
    .map(compactEntity)
    .filter((entity): entity is QlooEntityResult => Boolean(entity))
    .slice(0, limit);

  return {
    schema_version: QLOO_RESULT_SCHEMA_VERSION,
    operation: "rank",
    status: results.length > 0 ? "ok" : "empty",
    interpretation: {
      option_type: targetType,
      options: options.map(interpretedEntity),
      signals: resolvedSignals.map(interpretedEntity),
      signal_location: input.signal_location,
      include_tags: includeTags.interpreted,
      exclude_tags: excludeTags.interpreted,
    },
    resolution: resolutionReport(
      [...options, ...resolvedSignals].map((resolved) => resolved.outcome),
    ),
    results,
    result_count: results.length,
    execution: executionFor(context, startedAt),
    provenance: provenance("/v2/insights", "insights-api-deep-dive", [query]),
  };
}

// ---------------------------------------------------------------------------
// Workflow helpers
// ---------------------------------------------------------------------------

function clampLimit(value?: number) {
  if (!Number.isFinite(value)) return QLOO_DEFAULT_LIMIT;
  return Math.min(QLOO_MAX_RESULTS, Math.max(1, Math.round(value as number)));
}

function toSearchParams(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

/** Tags must be Qloo tag URNs; non-URN names are reported, never guessed. */
function resolveTagInputs(
  tags: string[],
  operator?: "union" | "intersection",
): {
  ids: string[];
  interpreted: Array<{ input: string; tagId: string; name: string; match: string }>;
  warnings: string[];
} {
  const ids: string[] = [];
  const interpreted: Array<{
    input: string;
    tagId: string;
    name: string;
    match: string;
  }> = [];
  const warnings: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("urn:tag:")) {
      warnings.push(
        `Tag "${trimmed}" is not a Qloo tag URN; resolve it with qloo_find_tags first.`,
      );
      continue;
    }
    ids.push(trimmed);
    interpreted.push({
      input: trimmed,
      tagId: trimmed,
      name: trimmed,
      match: "identifier",
    });
  }

  return { ids, interpreted, warnings };
}

type QlooInsightEntity = {
  name?: string;
  entity_id?: string;
  subtype?: string;
  properties?: {
    address?: string;
    description?: string;
    short_description?: string;
    overall_description?: string;
    ambience_description?: string;
    neighborhood_description?: string;
    customer_demographics_description?: string;
    unique_selling_points?: string;
    primary_genre?: string;
    good_for?: Array<{ name?: string }>;
    keywords?: unknown;
    business_rating?: number;
    live_music?: unknown;
    hotel_class?: unknown;
    star_rating?: unknown;
    number_of_rooms?: unknown;
    geocode?: {
      city?: string;
      admin1_region?: string;
      country?: string;
      name?: string;
    };
    locality?: { city?: { name?: string } };
  };
};

function normalizeQlooPlaces(
  entities: QlooInsightEntity[],
  city: string,
  intent?: string,
): QlooPlace[] {
  const wantsLodging = /hotel|stay|sleep|room|hostel|resort/i.test(intent ?? "");

  const candidates = entities
    .filter((entity) => entity?.name)
    .filter((entity) => {
      const props = entity.properties ?? {};
      // Qloo's taste graph loves hotels. Drop them unless the user asked to stay.
      const isLodging =
        props.hotel_class != null ||
        props.star_rating != null ||
        props.number_of_rooms != null;
      return wantsLodging || !isLodging;
    });

  const inRegion = candidates.filter((entity) => matchesCity(entity, city));
  const regional = inRegion.length >= 2 ? inRegion : candidates;

  return regional.map((entity) => {
    const props = entity.properties ?? {};
    const tags = (props.good_for ?? [])
      .map((tag) => tag?.name)
      .filter((name): name is string => Boolean(name));
    const description = firstText(
      props.description,
      props.short_description,
      props.overall_description,
      props.ambience_description,
      props.neighborhood_description,
    );

    return {
      name: entity.name!,
      address: props.address ?? null,
      category:
        firstText(props.primary_genre) || tags[0] || "Independent cultural venue",
      rating:
        typeof props.business_rating === "number" ? props.business_rating : null,
      description,
      reviews: [
        firstText(
          props.unique_selling_points,
          props.customer_demographics_description,
          props.neighborhood_description,
        ),
      ].filter(Boolean),
      google_maps_url: mapsUrl(entity.name!, props.address),
      culturalTags: dedupe([...tags, ...coerceKeywordList(props.keywords)]).slice(0, 8),
      qlooId: entity.entity_id,
    };
  });
}

function matchesCity(entity: QlooInsightEntity, city: string) {
  if (!city) return true;
  const cityToken = normalize(city.split(",")[0] ?? city);
  if (!cityToken) return true;

  const props = entity.properties ?? {};
  const haystack = [
    props.geocode?.city,
    props.geocode?.admin1_region,
    props.locality?.city?.name,
    props.address,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalize)
    .join(" ");

  return haystack.includes(cityToken);
}

const CATEGORY_VECTORS: Record<string, string[]> = {
  music: ["Music-first", "Live sets", "Deep cuts"],
  artist: ["Music-first", "Live sets", "Deep cuts"],
  film: ["Cinematic", "Indie screening", "Story-led"],
  movie: ["Cinematic", "Indie screening", "Story-led"],
  fashion: ["Design-forward", "Vintage", "Workwear"],
  brand: ["Design-forward", "Vintage", "Workwear"],
  art: ["Contemporary art", "Gallery", "Experimental"],
  food: ["Low-intervention", "Natural wine", "Local produce"],
  // Lateral modes
  book: ["Story-led", "Warm narratives", "Slow prose"],
  books: ["Story-led", "Warm narratives", "Slow prose"],
  literature: ["Story-led", "Warm narratives"],
  podcast: ["Voice-first", "Long-form listening", "Intimate tone"],
  podcasts: ["Voice-first", "Long-form listening", "Intimate tone"],
  media: ["Voice-first", "Story-led"],
  design: ["Design-forward", "Material honesty", "Considered detail"],
  interior: ["Design-forward", "Layered light", "Considered detail"],
  lighting: ["Layered light", "Warm dimming", "Considered detail"],
  architecture: ["Spatial calm", "Material honesty", "Considered detail"],
  aesthetic: ["Atmosphere-led", "Texture-forward"],
  aesthetics: ["Atmosphere-led", "Texture-forward"],
  wellness: ["Gentle pacing", "Comfort-first"],
};

/**
 * Build a human-readable Cultural Taste Vector. With live Qloo data we blend
 * the seed tastes with the tags of the places Qloo surfaced; offline we use
 * category-specific aesthetics so the vector still reflects the user.
 */
function buildCulturalVector(entities: CulturalEntity[], places: QlooPlace[]) {
  const fromEntities = entities.flatMap((entity) => {
    const categoryVectors =
      CATEGORY_VECTORS[entity.category.toLowerCase()] ?? [];
    return [entity.name, ...categoryVectors];
  });

  const fromPlaces = places.flatMap((place) => place.culturalTags.slice(0, 3));

  return dedupe([...fromEntities, ...fromPlaces]).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Multi-city fallback venue dataset
// ---------------------------------------------------------------------------

export type FallbackVenue = QlooPlace;

type CityFallbackData = {
  venues: FallbackVenue[];
  culturalContext: string;
};

const CITY_FALLBACKS: Record<string, CityFallbackData> = {
  "lagos, nigeria": {
    culturalContext:
      "Lagos is the heartbeat of Afrobeats, Alte culture, Nollywood, and West African contemporary art. Its nightlife spans beach-side lounges, warehouse art spaces, and intimate jazz joints.",
    venues: [
      {
        name: "Bogobiri House",
        address: "9 Maitama Sule St, Ikoyi, Lagos",
        category: "Boutique hotel, live-music venue & art gallery",
        rating: 4.3,
        description:
          "A lush art-drenched compound in Ikoyi hosting live Afrobeat, highlife, and Alte sessions. The garden courtyard fills with creatives after dark — poets, painters, musicians. Think weathered-wood galleries, outdoor stages, and cocktails stirred under palm fronds.",
        reviews: [
          "Like stepping into a living museum of Lagos culture — every corner has art, and the live music nights are genuine, not performative.",
          "The kind of place where you sit next to a Nollywood director at the bar and end up hearing an unreleased Cruel Santino track live.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Bogobiri+House+Lagos",
        culturalTags: [
          "Afrobeats",
          "Alte",
          "Tems",
          "Cruel Santino",
          "Live music",
          "Art gallery",
          "Nollywood",
        ],
      },
      {
        name: "Nok by Alara",
        address: "12A Akin Olugbade St, Victoria Island, Lagos",
        category: "Pan-African fine dining & cocktail bar",
        rating: 4.5,
        description:
          "A sleek, glass-fronted Pan-African restaurant inside the ALARA concept store on Victoria Island. The menu reimagines West African dishes with modern technique — think jollof arancini, suya-spiced octopus, and palm wine reductions. The space doubles as a design showcase.",
        reviews: [
          "Every dish is a conversation about what contemporary African cuisine can be — adventurous, rooted, visually stunning.",
          "The after-dinner crowd leans fashion-forward. You'll see emerging Lagos designers testing new fits alongside established art collectors.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Nok+by+Alara+Lagos",
        culturalTags: [
          "Pan-African cuisine",
          "Fashion",
          "Streetwear",
          "Contemporary art",
          "Design",
          "Fine dining",
        ],
      },
      {
        name: "Jazzhole",
        address: "168 Awolowo Rd, Ikoyi, Lagos",
        category: "Independent bookshop, vinyl store & gallery",
        rating: 4.4,
        description:
          "A legendary Ikoyi institution since 1989 — part bookshop, part vinyl crate-dig, part gallery. Shelves packed with Afrobeat first presses, African literature, contemporary photography books, and a hand-curated vinyl wall that spans Fela to Sango.",
        reviews: [
          "The vinyl selection is unmatched in Lagos — found original Fela pressings next to new Amaarae and Odunsi singles.",
          "Quiet, unhurried atmosphere where you can spend an afternoon browsing African fiction and flipping through rare records.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Jazzhole+Lagos",
        culturalTags: [
          "Vinyl",
          "Crate-digging",
          "Afrobeats",
          "Fela Kuti",
          "African literature",
          "Independent bookshop",
          "Art",
        ],
      },
      {
        name: "Terra Kulture",
        address: "Plot 1376, Tiamiyu Savage St, Victoria Island, Lagos",
        category: "Art center, theater & restaurant",
        rating: 4.2,
        description:
          "Victoria Island's cultural anchor — a multi-story complex housing a theater, contemporary art gallery, Nigerian bookshop, and restaurant. Regular exhibitions, stage plays, and film screenings make it a living hub for Lagos creatives.",
        reviews: [
          "The gallery rotates emerging Nigerian artists alongside established names. Every visit surfaces something new.",
          "Caught a spoken-word night here that shifted my understanding of Lagos storytelling — raw, emotional, totally unpretentious.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Terra+Kulture+Lagos",
        culturalTags: [
          "Contemporary art",
          "Theater",
          "Nollywood",
          "Literature",
          "Indie film",
          "A24 vibes",
        ],
      },
      {
        name: "Tarkwa Bay Beach",
        address: "Tarkwa Bay Island, Lagos",
        category: "Island beach & surf culture",
        rating: 4.0,
        description:
          "A boat-access-only beach on a sheltered island off Lagos — the city's quiet escape. Small vendors sell grilled fish, local drinks, and the vibe is barefoot, unhurried, away from Mainland intensity. Emerging surf culture and weekend DJ sets on the sand.",
        reviews: [
          "The boat ride over sets the tone — once you land, it feels like a different Lagos. Perfect for a low-key day with music and ocean.",
          "Caught a spontaneous Alte set here one Saturday — someone just set up speakers on the beach.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Tarkwa+Bay+Beach+Lagos",
        culturalTags: ["Beach culture", "Alte", "Low-key", "Surf", "DJ sets"],
      },
    ],
  },
  "brooklyn, new york": {
    culturalContext:
      "Brooklyn is a mosaic of underground hip-hop, DIY art spaces, vintage workwear culture, natural wine bars, and independent cinema. From Williamsburg crate-digging to Bed-Stuy jazz clubs, every neighborhood has its own frequency.",
    venues: [
      {
        name: "Vinyl & Vine",
        address: "228 Wythe Ave, Brooklyn, NY",
        category: "Natural wine bar and café",
        rating: 4.2,
        description:
          "An intimate Williamsburg natural-wine bar and daytime café with crate-digger hip-hop on vinyl, exposed brick, local zines, and a counter-service coffee window.",
        reviews: [
          "The soundtrack moves from underground rap to deep cuts, and the shelves are lined with records and art books.",
          "Relaxed workwear-friendly crowd, natural wine from small producers, and the kind of low-key room where you can settle in for hours.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Vinyl+%26+Vine+Brooklyn",
        culturalTags: [
          "MF DOOM",
          "Underground hip-hop",
          "Natural wine",
          "Vinyl",
          "Vintage Carhartt",
          "A24",
        ],
      },
      {
        name: "Nowadays",
        address: "56-06 Cooper Ave, Brooklyn, NY",
        category: "Outdoor club & event space",
        rating: 4.4,
        description:
          "A sprawling Ridgewood/Bushwick outdoor dance venue and garden. Weekend day parties move from house to broken-beat to ambient. The crowd is diverse, the sound system is serious, and the garden has a bonfire.",
        reviews: [
          "One of the few places left in Brooklyn that feels genuinely communal — music-first, no velvet rope.",
          "The garden bar has natural wine on tap and the DJ booth faces the trees, not the crowd.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Nowadays+Brooklyn",
        culturalTags: [
          "Electronic",
          "House",
          "Outdoor",
          "Dance",
          "Natural wine",
          "Community",
        ],
      },
      {
        name: "Human Relations",
        address: "1046 Flushing Ave, Brooklyn, NY",
        category: "Natural wine bar",
        rating: 4.3,
        description:
          "A Bushwick natural wine bar with a revolving cast of low-intervention wines, tinned fish, and a DJ corner that leans jazz-funk-soul. Dim lighting, concrete floors, intentionally no-sign entrance.",
        reviews: [
          "The kind of unmarked spot that rewards the curious — great pours, zero pretension, and whoever's DJing always surprises.",
          "Walked in wearing double-knee Carhartts and fit right in. The wine list changes weekly.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Human+Relations+Brooklyn",
        culturalTags: [
          "Natural wine",
          "Jazz",
          "Vintage workwear",
          "Underground",
          "Low-key",
        ],
      },
      {
        name: "Nublu",
        address: "151 Ave C, New York, NY",
        category: "Live music club",
        rating: 4.4,
        description:
          "An East Village institution for genre-defying live music — jazz, Brazilian, Afrobeat, and experimental electronic. Tiny stage, no barrier between band and crowd, and a late-night crowd that actually listens.",
        reviews: [
          "The lineup reads like a crate-digger's dream — you walk in for one set and stay for three.",
          "Sweaty, unpretentious, and always surprising. The kind of room where a guest horn player just shows up.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Nublu+New+York",
        culturalTags: ["Live music", "Jazz", "Afrobeat", "Experimental", "Late night"],
      },
    ],
  },
  "london, uk": {
    culturalContext:
      "London blends grime, UK garage, Afro-swing, and South Asian beats across its boroughs. From Peckham's DIY art scene to Shoreditch's vintage markets and Brixton's Caribbean roots, the city's cultural output is globally influential.",
    venues: [
      {
        name: "Corsica Studios",
        address: "4/5 Elephant Rd, London SE17 1LB",
        category: "Underground club & art space",
        rating: 4.5,
        description:
          "A twin-room Elephant & Castle institution for underground electronic, grime, experimental, and everything between. Dark rooms, serious Funktion-One sound, and programming that takes genuine risks.",
        reviews: [
          "The best sound system in South London, maybe all of London. The programming goes from ambient to jungle to noise in one weekend.",
          "No dress code, no attitude, just people who actually care about music. The smaller room is perfect for experimental sets.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Corsica+Studios+London",
        culturalTags: [
          "Electronic",
          "Grime",
          "UK Garage",
          "Underground",
          "Experimental",
          "Sound system",
        ],
      },
      {
        name: "Peckham Levels",
        address: "95A Rye Ln, London SE15 4ST",
        category: "Multi-story creative hub & food hall",
        rating: 4.2,
        description:
          "A converted multi-story car park in Peckham housing artist studios, independent food vendors, a rooftop bar, and a rotating gallery. The food spans West African, Caribbean, and East Asian, and the rooftop views of the city are unbeatable at sunset.",
        reviews: [
          "Every floor is a surprise — passed a ceramics studio, a vintage shop, a Nigerian suya spot, and a DJ mixing garage all in ten minutes.",
          "The rooftop bar at golden hour with the city skyline is a spiritual experience. The crowd is the most diverse in London.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Peckham+Levels+London",
        culturalTags: [
          "Afro-swing",
          "Caribbean food",
          "Art studios",
          "Vintage",
          "Streetwear",
          "Rooftop",
        ],
      },
      {
        name: "Rough Trade East",
        address: "Old Truman Brewery, 91 Brick Ln, London E1 6QL",
        category: "Record shop, live music & café",
        rating: 4.6,
        description:
          "An iconic Brick Lane record store with deep crates spanning indie, hip-hop, electronic, jazz, and world music. Regular in-store performances, a coffee bar, and a curated book/zine section.",
        reviews: [
          "Still the best record shop in London for discovery — the staff picks alone are worth the trip.",
          "Caught a surprise in-store set from an artist I'd never heard of and left with three records I didn't know I needed.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Rough+Trade+East+London",
        culturalTags: [
          "Vinyl",
          "Indie",
          "Hip-hop",
          "Crate-digging",
          "Live music",
          "Brick Lane",
        ],
      },
    ],
  },
  "tokyo, japan": {
    culturalContext:
      "Tokyo's culture layers ancient tradition with cutting-edge fashion, city pop, jazz kissaten, and the world's deepest vinyl culture. From Shimokitazawa's vintage shops to Shinjuku's tiny standing bars, every alley has a frequency.",
    venues: [
      {
        name: "BIG LOVE RECORDS",
        address: "3-28-15 Jingumae, Shibuya City, Tokyo",
        category: "Independent record shop",
        rating: 4.7,
        description:
          "A small, meticulously curated Harajuku record shop specializing in indie, post-punk, shoegaze, and experimental. The owner hand-selects every title, and the listening station is a rite of passage for visiting music heads.",
        reviews: [
          "Walked in looking for one Japanese indie record and left with five I'd never heard of — every recommendation was perfect.",
          "The curation here is an art form. Tiny space, massive impact. If you care about music, this is a pilgrimage stop.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=BIG+LOVE+RECORDS+Tokyo",
        culturalTags: [
          "Indie",
          "Shoegaze",
          "Post-punk",
          "Vinyl",
          "Crate-digging",
          "Japanese music",
        ],
      },
      {
        name: "Bar Martha",
        address: "B1F, 1-33-13 Ebisu, Shibuya City, Tokyo",
        category: "Listening bar & natural wine",
        rating: 4.5,
        description:
          "An Ebisu basement listening bar with a valve-amp sound system, natural wines, and a no-phone-photos policy. The owner selects jazz, soul, ambient, and city pop on vinyl. Dark wood, soft amber light, serious audiophile energy.",
        reviews: [
          "The best listening bar experience in Tokyo — the sound system makes you hear records you've owned for years differently.",
          "Natural wine list is short but every bottle is thoughtful. The room holds maybe 20 people and the vibe is sacred.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Bar+Martha+Ebisu+Tokyo",
        culturalTags: [
          "Jazz",
          "City pop",
          "Natural wine",
          "Listening bar",
          "Audiophile",
          "Ambient",
        ],
      },
      {
        name: "Shimokitazawa Vintage District",
        address: "Shimokitazawa, Setagaya City, Tokyo",
        category: "Vintage shopping neighborhood",
        rating: 4.6,
        description:
          "A labyrinth of narrow streets packed with vintage clothing shops, used bookstores, tiny live-music venues, and indie cafés. The style leans American workwear-meets-Japanese streetwear — Kapital, Needles, vintage Levi's, and military surplus.",
        reviews: [
          "If you love vintage workwear and Japanese streetwear, Shimokitazawa is paradise. Every shop has a distinct point of view.",
          "Spent an entire day here moving between vintage racks, tiny coffee shops, and a basement live house. Felt like Brooklyn meets Kyoto.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Shimokitazawa+vintage+Tokyo",
        culturalTags: [
          "Vintage",
          "Streetwear",
          "Japanese fashion",
          "Workwear",
          "Indie",
          "Carhartt",
        ],
      },
    ],
  },
  "accra, ghana": {
    culturalContext:
      "Accra is the home of highlife, Afrobeats, drill, and a fast-rising contemporary art scene. The energy runs from Osu's bars and galleries to East Legon's design studios and Jamestown's historic streets.",
    venues: [
      {
        name: "Nubuke Foundation",
        address: "7 Lome Close, East Legon, Accra",
        category: "Contemporary art foundation & garden",
        rating: 4.4,
        description:
          "A calm, garden-set contemporary art foundation in East Legon showing Ghanaian and West African artists. Rotating exhibitions, talks, and a small shop stocked with artist books and textiles.",
        reviews: [
          "The kind of gallery where the guard knows the artists and the garden is part of the show — thoughtful, unhurried curation.",
          "Caught a young photographer's show here and then spent an hour talking to the curator. Very Accra creative scene.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Nubuke+Foundation+Accra",
        culturalTags: ["Contemporary art", "Ghanaian artists", "Gallery", "Design", "Quiet"],
      },
      {
        name: "The Mix Design Hub",
        address: "Boundary Rd, East Legon, Accra",
        category: "Design studio, café & concept store",
        rating: 4.3,
        description:
          "A design-forward compound in East Legon combining a café, concept store, and studio spaces for local makers. Regular pop-ups spotlight Ghanaian streetwear, ceramics, and furniture design.",
        reviews: [
          "Half the people there are working on a collection or a photo shoot. Great coffee and a genuinely local design crowd.",
          "The pop-up markets are where you find the young Accra labels before they blow up.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=The+Mix+Design+Hub+Accra",
        culturalTags: ["Streetwear", "Ghanaian design", "Concept store", "Café", "Pop-ups"],
      },
      {
        name: "Untamed Empire",
        address: "Osu, Accra",
        category: "Creative hub, bar & event space",
        rating: 4.2,
        description:
          "A multi-room creative space in Osu hosting exhibitions, listening sessions, and pop-up markets. The courtyard bar draws a young crowd of designers, musicians, and photographers.",
        reviews: [
          "The listening sessions here are the closest thing to an Accra basement party with actual curation.",
          "Fashion crowd, good DJs, and a courtyard that stays busy until late. Come for a launch, stay for the people.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Untamed+Empire+Accra",
        culturalTags: ["Afrobeats", "Drill", "Fashion", "Listening session", "Courtyard bar"],
      },
    ],
  },
  "paris, france": {
    culturalContext:
      "Paris layers contemporary art, independent cinema, natural wine, and electronic music. Beyond the monuments, the creative energy lives in the 10th, 11th, 18th, and 20th arrondissements.",
    venues: [
      {
        name: "Le Comptoir Général",
        address: "80 Quai de Jemmapes, 75010 Paris",
        category: "Cultural bar & exhibition space",
        rating: 4.3,
        description:
          "A sprawling canal-side space on the Quai de Jemmapes styled as a living cabinet of global culture — vintage signage, tropical plants, a bookshop, and a bar. Evening programming mixes DJ sets, talks, and exhibitions.",
        reviews: [
          "Feels like wandering through a beautifully chaotic museum where someone is pouring natural wine in the corner.",
          "The crowd is creative and unpretentious, and the canal terrace at sunset is hard to beat.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Le+Comptoir+G%C3%A9n%C3%A9ral+Paris",
        culturalTags: ["Natural wine", "DJ sets", "Exhibitions", "Canal", "Global culture"],
      },
      {
        name: "Ground Control",
        address: "81 Rue du Charolais, 75012 Paris",
        category: "Food hall, bar & cultural venue",
        rating: 4.4,
        description:
          "A huge former postal sorting centre turned food hall and cultural venue near Gare de Lyon. Street-food stalls, craft beer and natural wine bars, a bookshop, and a programming calendar of talks, DJs, and markets.",
        reviews: [
          "The rare Paris spot where you can eat well, drink natural wine, and catch a talk or a DJ set without changing venue.",
          "Very mixed crowd, very relaxed dress code — a good antidote to Parisian formality.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Ground+Control+Paris",
        culturalTags: ["Street food", "Natural wine", "DJ sets", "Markets", "Design"],
      },
      {
        name: "Palais de Tokyo",
        address: "13 Av. du Président Wilson, 75116 Paris",
        category: "Contemporary art museum & late-night bar",
        rating: 4.5,
        description:
          "A vast contemporary art centre near the Seine with adventurous exhibitions and a late-opening bar-restaurant. The programming leans experimental — installation, performance, and emerging international artists.",
        reviews: [
          "The exhibitions are hit-or-miss in the best way — always something that makes you argue on the way out.",
          "Stay for the evening programme; the bar turns into a genuinely good spot for a low-key night.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Palais+de+Tokyo+Paris",
        culturalTags: ["Contemporary art", "Experimental", "Performance", "Late-night bar"],
      },
    ],
  },
  "berlin, germany": {
    culturalContext:
      "Berlin is defined by techno, experimental electronic music, DIY art spaces, and a deep vinyl culture. The creative scene is spread across Kreuzberg, Neukölln, Friedrichshain, and Wedding.",
    venues: [
      {
        name: "Oye Records",
        address: "Oderstraße 7, 10247 Berlin",
        category: "Independent record shop",
        rating: 4.6,
        description:
          "A Neukölln record shop with a serious selection of house, techno, jazz, soul, and Brazilian music. Staff picks are hand-written, the listening stations are always busy, and the shop hosts in-store DJ sets.",
        reviews: [
          "One of the few Berlin shops where the staff will actually talk you through the new arrivals instead of ignoring you.",
          "Found deep house and obscure jazz reissues I'd been hunting for years. Prices are fair for the quality.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Oye+Records+Berlin",
        culturalTags: ["Vinyl", "House", "Techno", "Jazz", "Crate-digging"],
      },
      {
        name: "Kater Blau",
        address: "Holzmarktstraße 25, 10243 Berlin",
        category: "Riverside club & open-air space",
        rating: 4.2,
        description:
          "A riverside club at Holzmarkt with multiple indoor and outdoor floors, quirky decor, and a programme spanning house, techno, and live experimental acts. The garden and waterfront make it a daytime-to-late-night venue.",
        reviews: [
          "The outdoor area by the river is the reason to come early — bring sunglasses and stay for the sunrise set.",
          "Less grim than the big techno temples, more playful. The sound is still serious.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Kater+Blau+Berlin",
        culturalTags: ["Techno", "House", "Open-air", "Riverside", "Experimental"],
      },
      {
        name: "König Galerie",
        address: "Alexandrinenstraße 118-121, 10969 Berlin",
        category: "Contemporary art gallery",
        rating: 4.4,
        description:
          "A major contemporary gallery in a brutalist former church in Kreuzberg, showing international artists across painting, sculpture, and installation. Large-scale shows and a bookshop.",
        reviews: [
          "The building alone is worth the visit — concrete, light, and scale that makes the art feel monumental.",
          "Strong programme of international artists, and it's never as crowded as the museum island blockbusters.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=K%C3%B6nig+Galerie+Berlin",
        culturalTags: ["Contemporary art", "Brutalist", "Gallery", "Installation", "Design"],
      },
    ],
  },
  "seoul, south korea": {
    culturalContext:
      "Seoul moves fast between K-indie, hip-hop, club culture, and a globally influential fashion and art scene. Itaewon, Hongdae, Seongsu, and Hannam each carry a distinct creative frequency.",
    venues: [
      {
        name: "Vinyl & Plastic",
        address: "Itaewon, Yongsan-gu, Seoul",
        category: "Record bar & listening room",
        rating: 4.4,
        description:
          "A compact Itaewon bar lined with vinyl and a serious sound system, where the owner spins soul, jazz, city pop, and hip-hop. Small room, attentive crowd, and a no-shouting policy when a record is on.",
        reviews: [
          "Exactly the kind of listening bar Seoul does better than almost anywhere — great selection, no pretension.",
          "The owner will pull a record based on one artist you mention. Ended up staying three hours.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Vinyl+%26+Plastic+Seoul",
        culturalTags: ["Vinyl", "City pop", "Jazz", "Soul", "Listening bar"],
      },
      {
        name: "Cakeshop",
        address: "Itaewon, Yongsan-gu, Seoul",
        category: "Underground club",
        rating: 4.2,
        description:
          "A long-running basement club in Itaewon for house, techno, hip-hop, and experimental sets. Low ceilings, a tight soundsystem, and a crowd that comes for the music rather than the photo.",
        reviews: [
          "The basement feels like a proper club should — dark, loud, and focused on the DJ.",
          "Caught a local hip-hop night and a techno night in the same week. Programming is genuinely varied.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Cakeshop+Seoul",
        culturalTags: ["House", "Techno", "Hip-hop", "Underground", "Basement"],
      },
      {
        name: "Seongsu-dong",
        address: "Seongsu-dong, Seongdong-gu, Seoul",
        category: "Creative neighborhood & concept stores",
        rating: 4.5,
        description:
          "Seoul's former shoe-factory district turned creative quarter — independent cafés, concept stores, galleries, and pop-ups in converted industrial spaces. The area is a showcase for emerging Korean fashion and design.",
        reviews: [
          "Every block has a new pop-up or a tiny gallery. It's the best place to see what Korean streetwear is doing right now.",
          "Come on a weekday for a slower pace, then stay for the coffee and the concept stores.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Seongsu-dong+Seoul",
        culturalTags: ["Streetwear", "Korean fashion", "Concept stores", "Galleries", "Cafés"],
      },
    ],
  },
  "mexico city, mexico": {
    culturalContext:
      "Mexico City's culture runs through contemporary art, independent cinema, mezcal, and a thriving electronic and cumbia scene. Roma, Condesa, Juárez, and Coyoacán hold most of the creative energy.",
    venues: [
      {
        name: "Museo Tamayo",
        address: "Av. Paseo de la Reforma 51, Bosque de Chapultepec, CDMX",
        category: "Contemporary art museum",
        rating: 4.5,
        description:
          "A contemporary art museum in Chapultepec with a strong programme of Mexican and international artists, experimental installations, and a sculpture garden. Often hosts talks, performances, and late openings.",
        reviews: [
          "The temporary shows are consistently more adventurous than the big museum blockbusters.",
          "The sculpture garden is a peaceful reset in the middle of the city, and the bookshop is excellent.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Museo+Tamayo+Mexico+City",
        culturalTags: ["Contemporary art", "Installation", "Performance", "Museum", "Design"],
      },
      {
        name: "Licorería Limantour",
        address: "Av. Álvaro Obregón 106, Roma Norte, CDMX",
        category: "Cocktail bar",
        rating: 4.4,
        description:
          "A Roma Norte cocktail bar known for agave-forward drinks, a lively but unpretentious room, and a crowd that spans local creatives and visitors. The menu leans into mezcal, tequila, and seasonal Mexican ingredients.",
        reviews: [
          "The mezcal cocktails are genuinely inventive without being gimmicky. Go early to get a seat at the bar.",
          "Great music, no attitude, and the kind of room where you end up talking to the next table.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Licorer%C3%ADa+Limantour+Mexico+City",
        culturalTags: ["Mezcal", "Cocktails", "Roma Norte", "Music", "Local crowd"],
      },
      {
        name: "Cine Tonalá",
        address: "Tonalá 261, Roma Sur, CDMX",
        category: "Independent cinema, bar & restaurant",
        rating: 4.3,
        description:
          "An independent cinema and restaurant in Roma Sur screening arthouse, documentary, and Latin American films. The bar and terrace turn into a hangout before and after screenings.",
        reviews: [
          "The programme is the best in the city for independent and Latin American cinema — arrive early for a drink on the terrace.",
          "Feels like a neighbourhood living room for people who care about film. Great food too.",
        ],
        google_maps_url:
          "https://www.google.com/maps/search/?api=1&query=Cine+Tonal%C3%A1+Mexico+City",
        culturalTags: ["Independent cinema", "Arthouse", "Latin American film", "Terrace bar"],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// City-aware fallback venue lookup
// ---------------------------------------------------------------------------

/**
 * Normalise and match a city string against our built-in fallback datasets.
 * Matches "Lagos", "Lagos, Nigeria", "Brooklyn", "Brooklyn, NY", "London",
 * "London, UK", "Tokyo, Japan", etc. — without cross-matching countries
 * (e.g. "Abuja, Nigeria" must NOT return Lagos venues).
 */
export function getCityFallbackVenues(city: string): {
  venues: FallbackVenue[];
  culturalContext: string;
  isBuiltIn: boolean;
} {
  const normalized = city.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) {
    return {
      venues: [],
      culturalContext: "No city specified.",
      isBuiltIn: false,
    };
  }

  const cityToken = normalized.split(",")[0]?.trim() ?? "";
  const aliases: Record<string, string> = {
    lagos: "lagos, nigeria",
    brooklyn: "brooklyn, new york",
    "new york": "brooklyn, new york",
    "new york city": "brooklyn, new york",
    nyc: "brooklyn, new york",
    london: "london, uk",
    tokyo: "tokyo, japan",
    accra: "accra, ghana",
    paris: "paris, france",
    berlin: "berlin, germany",
    seoul: "seoul, south korea",
    "mexico city": "mexico city, mexico",
    cdmx: "mexico city, mexico",
  };

  const aliasTarget = aliases[cityToken];
  if (aliasTarget && CITY_FALLBACKS[aliasTarget]) {
    return { ...CITY_FALLBACKS[aliasTarget], isBuiltIn: true };
  }

  for (const [fallbackKey, data] of Object.entries(CITY_FALLBACKS)) {
    if (normalized === fallbackKey) return { ...data, isBuiltIn: true };

    const fallbackCity = fallbackKey.split(",")[0]?.trim() ?? "";
    // Whole-word neighbourhood matches: "Williamsburg, Brooklyn" → Brooklyn.
    if (new RegExp(`(^|\\s)${escapeRegExp(fallbackCity)}(\\s|$)`).test(normalized)) {
      return { ...data, isBuiltIn: true };
    }
  }

  return {
    venues: [],
    culturalContext: `${city} — no built-in venue dataset. The agent should use Qloo live results or its own knowledge to suggest real, culturally authentic independent venues in this city. Prefer independent cultural spaces over chains, tourist traps, and hotel dining rooms.`,
    isBuiltIn: false,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "entity"
  );
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapsUrl(name: string, address?: string | null) {
  const query = [name, address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Qloo sometimes returns nested objects/arrays where we expect a string. */
function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => firstText(item))
        .filter(Boolean)
        .join(" ");
      if (joined) return joined;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const nested = firstText(record.text, record.description, record.name);
      if (nested) return nested;
    }
  }
  return "";
}

function coerceKeywordList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => coerceKeywordList(item));
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return coerceKeywordList(record.name ?? record.text);
  }
  return [];
}
