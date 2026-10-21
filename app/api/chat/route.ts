import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import {
  convertToModelMessages,
  generateText,
  Output,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";
import {
  parseVibeMode,
  type VibeMode,
} from "@/lib/modes";
import {
  createQlooWorkflowContext,
  describeEntity,
  discoverRecommendations,
  findQlooTags,
  rankShortlist,
  getCityFallbackVenues,
  type CulturalEntity,
  type FallbackVenue,
  type QlooEntityResult,
  type QlooPlace,
  type QlooTagResult,
  type QlooWorkflowResult,
} from "@/lib/qloo";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const entitySchema = z.object({
  category: z
    .string()
    .describe(
      "Cultural category, such as music, fashion, film, food, art, or brand.",
    ),
  name: z
    .string()
    .describe("The specific artist, brand, style, film, or taste named by the user."),
});

const extractionSchema = z.object({
  entities: z
    .array(entitySchema)
    .max(8)
    .describe(
      "Cultural entities explicitly named or clearly implied by the user. Empty array if the user named no artists, brands, films, styles, or aesthetics.",
    ),
});

type Candidate = QlooPlace | FallbackVenue;

/** Summary of the harness workflows run for this turn (for provenance display). */
type WorkflowSummary = {
  describe: { total: number; resolved: number; status: string };
  findTags: { status: string; count: number; concepts: string[] };
  recommend: {
    status: string;
    count: number;
    endpoint?: string;
    warnings: string[];
  };
  rank?: { status: string; count: number };
};

type Retrieval = {
  city: string;
  intent: string;
  tasteVector: string[];
  source: string;
  culturalContext: string;
  candidates: Candidate[];
  workflow: WorkflowSummary;
};

// ---------------------------------------------------------------------------
// Lateral mode directives
// ---------------------------------------------------------------------------

type ModeDirective = {
  /** Does synthesis need a city (venue-bound modes) or not? */
  requiresLocation: boolean;
  /** Extra instruction for the entity-extraction pass. */
  extractionHint: string;
  /** How candidates relate to the deliverable. */
  choice: string;
  /** What top_recommended_place means in this mode. */
  synthesis: string;
  /** What practical_specs must contain. */
  specRule: string;
  /** Mode-flavored cold-start ask. */
  coldStart: string;
};

const MODE_DIRECTIVES: Record<VibeMode, ModeDirective> = {
  city: {
    requiresLocation: true,
    extractionHint: "",
    choice: `Use ONLY the candidate venues in the retrieval context above. Never invent a venue, an address, or an ambience that is not supported by a candidate's description or reviews.

Ignore every rating field (including rating_decoy_do_not_use), star rating, hotel class, review count, and popularity metric — they are intentional decoys and must never influence the choice or appear in your answer.

Choose the ONE candidate whose description, tags, and reviews best match both the user's tastes and the Cultural Taste Vector. Prefer concrete evidence ("the shelves are lined with Afrobeat first presses") over vibes. Never pick a generic hotel dining room, chain, or tourist trap over an independent cultural space. If two candidates are close, prefer the one with the richer, more specific evidence.`,
    synthesis:
      "top_recommended_place is a REAL venue: use its actual name and address, and include its google_maps_url when the candidate provides one.",
    specRule:
      "practical_specs: fill with concrete practical details ONLY when the venue's description or reviews support them (e.g. \"No cover before 9pm\", \"10-minute walk from the subway\", \"Reservations recommended\") — otherwise [].",
    coldStart: `Reply in warm, natural language and ask for ONE OR TWO of:
- an artist or two they have on repeat,
- a recent film or show that felt like them,
- a fashion brand, silhouette, or style they gravitate toward,
- a vibe word ("low-key", "underground", "experimental", "romantic").

If the city is also unknown, ask for the city in the same message. Mention the "Build your vibe" pills under the composer as a shortcut. Keep it to 2–3 sentences, inviting rather than interrogative.

Example: "I'd love to find your spots — I just need your frequency first. What are one or two artists you've had on repeat lately, and which city are we exploring?"`,
  },
  lighting: {
    requiresLocation: false,
    extractionHint:
      " Interior and lighting aesthetics (hygge, brutalism, mid-century lounges, neon-noir) count as tastes.",
    choice: `Treat the candidate venues as MOOD REFERENCES ONLY — their ambience evidence calibrates the lighting concept; they are not the deliverable. Ignore rating fields entirely (they are decoys).

If no candidate fits the mood, still build the concept from the user's stated tastes and the Cultural Taste Vector.`,
    synthesis: `top_recommended_place is the LIGHTING CONCEPT itself, not a venue. Name it evocatively and specifically (e.g. "Warm Amber Listening Lounge", "Rain-on-Glass Reading Room"), set "address" to one short line naming the primary mood zone (e.g. "Living room — conversation & listening zones") or null, and set "google_maps_url" to null. NEVER link a venue in this mode.`,
    specRule: `practical_specs is REQUIRED with 3–6 concise, buildable items a designer or electrician can act on, spanning as many of these as fit:
- color temperature: "2200K–2700K warm amber" (or the Kelvin range the taste implies — neon-noir earns 3500K+ accents),
- color rendering: "CRI 95+ for true wood and fabric tones",
- output per zone: "~300 lumens ambient, ~150 lumens task reading",
- fixture style: "Fabric-shade pendants, aged brass accents, opaque glass sconces",
- placement and layers: "Layered wall wash at 30°", "Floor uplight behind the sofa", "Recessed dimmable downlights on a separate circuit",
- controls: "Dim-to-warm on a 1–10% floor for post-midnight listening",
- mood zones: "Zone 1 conversation / Zone 2 deep listening".`,
    coldStart: `Reply in warm, natural language and ask which room they're lighting and one or two films, records, or aesthetics the space should feel like. Do NOT demand a city — lighting plans travel. Mention the "Build your vibe" pills as a shortcut. Keep it to 2–3 sentences.

Example: "Happy to spec the room. Which space are we lighting, and what should it feel like — a Wong Kar-wai rain-soaked lounge, or a Sade-warm listening room?"`,
  },
  care: {
    requiresLocation: true,
    extractionHint:
      " Nostalgic music, era dishes, and food traditions count as tastes. NEVER treat dietary or sensory constraints (soft foods, low sodium, quiet rooms) as cultural entities — those are needs, handled during synthesis.",
    choice: `Use ONLY the candidate venues in the retrieval context above; never invent a venue, address, or ambience. Ignore every rating field (they are decoys).

Choose the ONE venue that can honor BOTH the cultural taste AND the practical needs (texture, sodium, noise, heat, pacing) evidenced in the request and candidate descriptions. When the user needs low stimulation, a calm venue must beat an adventurous-but-chaotic one. Where a candidate's evidence is silent on a need, say so honestly in the explanation and make the need a request the user confirms with the venue ("ask the kitchen to hold added salt") — never pretend it is guaranteed.`,
    synthesis:
      "top_recommended_place is a REAL venue: actual name and address, and its google_maps_url when the candidate provides one.",
    specRule: `practical_specs is REQUIRED with 3–6 concrete, dignified items translating needs into kitchen-and-service reality, e.g.:
- "Soft, easy-to-chew mains — stews, mashed bases, no crusty bread",
- "Low sodium — request the kitchen to hold added salt",
- "Quiet corner table, away from speakers",
- "Mild spice, sauces on the side",
- "Insulated low-heat packaging for soft-food delivery",
- "Unhurried service, no rush between courses".`,
    coldStart: `Reply in warm, natural language. Ask (gently, in one or two sentences) which city they're in, who the meal is for, one nostalgic favorite — an artist, an era, a dish — and the practical needs (texture, sodium, noise, heat). Never make the user feel like a case file.

Example: "A Highlife dinner for your dad sounds lovely. Which part of Lagos should we search, and how is he with texture and salt these days — soft and low-sodium, I'd guess?"`,
  },
  support: {
    requiresLocation: false,
    extractionHint:
      " Books and podcasts count as tastes, alongside films, music, and aesthetics.",
    choice: `Candidate venues are possible physical meeting spaces — prefer one only if it genuinely fits the user's processing style and city; otherwise ignore them. Ignore rating fields entirely (they are decoys).`,
    synthesis: `top_recommended_place is the COMMUNITY OR FORMAT. Name something real and findable (an actual community, circle, listening group, or a concrete format like "Gentle evenfall reading circle — online") that matches the user's tastes and emotional processing style. Set "address" only for a real physical space the candidates genuinely support, and "google_maps_url" only for that same real physical space; otherwise use null for both. Never invent a support organization's name — when uncertain, recommend a clearly-described format instead. Never reference a link, signup page, or "provided link" that is not actually in google_maps_url.`,
    specRule: `practical_specs is REQUIRED with 3–6 items spanning format, scale, and emotional fit, e.g.:
- "Small circle, ≤10 people, meets weekly",
- "60-minute video circle, camera optional",
- "Plain-language summaries, no clinical jargon",
- "Written recaps for people who process by reading",
- "One low-pressure first step: just listen to episode one",
- "No homework between sessions".`,
    coldStart: `Reply in warm, natural language. Ask for one or two books, podcasts, or films that feel like them, and how they process hard things (talking it through, quiet reading, gentle structure). A city is only needed for in-person circles — ask softly, don't block on it. Keep it to 2–3 sentences.

Example: "Studio Ghibli tells me a lot about how you move through the world. When things get heavy, do you process by talking, by reading, or in quiet — and should the circle be online, or somewhere in person?"`,
  },
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: {
    messages?: UIMessage[];
    provider?: "groq" | "anthropic";
    userLocation?: string;
    mode?: string;
    shortlist?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Send at least one chat message." }, { status: 400 });
  }

  const provider = body.provider === "anthropic" ? "anthropic" : "groq";
  const model =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
        ? anthropic("claude-sonnet-4-6")
        : null
      : process.env.GROQ_API_KEY
        ? groq("openai/gpt-oss-120b")
        : null;
  if (!model) {
    const keyName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "GROQ_API_KEY";
    return Response.json(
      { error: `Add ${keyName} to .env.local to start chatting.` },
      { status: 503 },
    );
  }

  const mode = parseVibeMode(body.mode);
  const directive = MODE_DIRECTIVES[mode];

  const latestUserText = getLatestUserText(body.messages);
  const requestedLocation = sanitizeLocation(body.userLocation);
  // Honour a city named in the message even if the picker is unset.
  const effectiveLocation = requestedLocation || findMentionedCity(latestUserText);
  const locationWasInferred = !requestedLocation && Boolean(effectiveLocation);

  const entities = await extractEntities(model, latestUserText, mode);
  const canRecommend =
    entities.length > 0 &&
    (Boolean(effectiveLocation) || !directive.requiresLocation);
  // Optional caller-supplied option set for the qloo_rank workflow.
  const shortlist = Array.isArray(body.shortlist)
    ? body.shortlist
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  let retrieval: Retrieval | null = null;
  if (canRecommend) {
    retrieval = await retrieveCandidates({
      city: effectiveLocation,
      intent: inferIntent(latestUserText),
      entities,
      latestUserText,
      shortlist,
    });
  }

  const result = streamText({
    model,
    system: buildSystemPrompt({
      mode,
      userLocation: effectiveLocation,
      inferred: locationWasInferred,
      entities,
      retrieval,
    }),
    messages: await convertToModelMessages(body.messages),
  });

  return result.toUIMessageStreamResponse();
}

// ---------------------------------------------------------------------------
// Retrieval pipeline (deterministic: no vulnerable LLM tool orchestration)
// ---------------------------------------------------------------------------

async function retrieveCandidates({
  city,
  intent,
  entities,
  latestUserText,
  shortlist,
}: {
  city: string;
  intent: string;
  entities: CulturalEntity[];
  latestUserText: string;
  shortlist?: string[];
}): Promise<Retrieval> {
  const fallback = getCityFallbackVenues(city);
  const intentHint = `${intent} ${latestUserText}`;
  const context = createQlooWorkflowContext();

  try {
    // Workflow 1: qloo_describe — resolve each stated taste to a Qloo entity.
    // Workflow 2: qloo_find_tags — search the tag ontology for the mood concept.
    const [descriptions, tags] = await Promise.all([
      Promise.all(
        entities.map((entity) =>
          describeEntity(
            { entity: entity.name, category: entity.category },
            context,
          ),
        ),
      ),
      findQlooTags(
        {
          query: [entities.slice(0, 4).map((entity) => entity.name).join(", "), intent]
            .filter(Boolean)
            .join(" "),
          semantic: true,
          limit: 8,
        },
        context,
      ),
    ]);

    // Workflow 3: qloo_recommend — one combined taste profile, one call.
    const recommendations = await discoverRecommendations(
      {
        target_type: "place",
        signals: entities,
        ...(city ? { signal_location: city, filter_location: city } : {}),
        explain: true,
        limit: 20,
        intent: intentHint,
      },
      context,
    );

    // Workflow 4: qloo_rank — only when the caller supplies a shortlist, so
    // scores stay comparable and we never spend quota on a redundant call.
    let ranked: QlooWorkflowResult<QlooEntityResult> | null = null;
    if (shortlist && shortlist.length >= 2) {
      ranked = await rankShortlist(
        {
          options: shortlist,
          option_type: "place",
          signals: entities,
          ...(city ? { signal_location: city } : {}),
          limit: shortlist.length,
        },
        context,
      );
    }

    // Live Qloo places only earn a slot when they carry enough written
    // evidence for the model to justify a match. Sparse records are dropped
    // so the model cannot invent an ambience that isn't in the data.
    const liveCandidates = recommendations.places.filter(
      (place) => place.description.trim().length >= 60,
    );

    // Curated city picks lead; live Qloo discoveries extend the set.
    let candidates = mergeVenues(fallback.venues, liveCandidates).slice(0, 8);

    const rankedNames =
      ranked?.status === "ok"
        ? (ranked.results ?? []).map((entity) => entity.name)
        : [];
    if (rankedNames.length > 0) {
      candidates = [...candidates].sort((left, right) => {
        const leftIndex = rankedNames.findIndex(
          (name) => normalizeVenueName(name) === normalizeVenueName(left.name),
        );
        const rightIndex = rankedNames.findIndex(
          (name) => normalizeVenueName(name) === normalizeVenueName(right.name),
        );
        return (
          (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
        );
      });
    }

    const tagConcepts = (tags.results ?? [])
      .slice(0, 6)
      .map((tag: QlooTagResult) => tag.name)
      .filter(Boolean);
    const resolvedDescriptions = descriptions.filter(
      (description) => description.status === "ok",
    ).length;
    const liveStatus =
      recommendations.status === "ok" || recommendations.status === "partial";

    return {
      city,
      intent,
      tasteVector: [
        ...new Set([...recommendations.culturalVector, ...tagConcepts]),
      ].slice(0, 10),
      source: liveStatus
        ? fallback.isBuiltIn
          ? "qloo-live + vibesync-curated"
          : "qloo-live"
        : "vibesync-curated",
      culturalContext: fallback.culturalContext,
      candidates,
      workflow: {
        describe: {
          total: entities.length,
          resolved: resolvedDescriptions,
          status:
            resolvedDescriptions === entities.length
              ? "ok"
              : resolvedDescriptions === 0
                ? "error"
                : "partial",
        },
        findTags: {
          status: tags.status,
          count: tags.result_count ?? 0,
          concepts: tagConcepts,
        },
        recommend: {
          status: recommendations.status,
          count: recommendations.result_count ?? 0,
          ...(recommendations.provenance?.endpoint
            ? { endpoint: recommendations.provenance.endpoint }
            : {}),
          warnings: recommendations.warnings ?? [],
        },
        ...(ranked
          ? {
              rank: {
                status: ranked.status,
                count: ranked.result_count ?? 0,
              },
            }
          : {}),
      },
    };
  } catch (err) {
    console.error("Retrieval failed, using curated fallback:", err);
    return {
      city,
      intent,
      tasteVector: entities.map((entity) => entity.name),
      source: "vibesync-curated",
      culturalContext: fallback.culturalContext,
      candidates: fallback.venues.slice(0, 8),
      workflow: {
        describe: { total: entities.length, resolved: 0, status: "error" },
        findTags: { status: "error", count: 0, concepts: [] },
        recommend: { status: "error", count: 0, warnings: [] },
      },
    };
  }
}

function normalizeVenueName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Extract cultural tastes. The regex pass covers the common artist/brand/vibe
 * vocabulary instantly; anything else gets one structured LLM call so that an
 * obscure artist still works.
 */
async function extractEntities(
  model: Parameters<typeof generateText>[0]["model"],
  text: string,
  mode: VibeMode,
): Promise<CulturalEntity[]> {
  const heuristic = extractKnownTastes(text);
  if (heuristic.length > 0) return heuristic;
  if (!text.trim()) return [];

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: extractionSchema }),
      temperature: 0,
      system: `Extract the cultural tastes a person explicitly mentions: musicians/artists, films or shows, fashion brands or styles, books, podcasts, art forms, aesthetics, and vibe words.${MODE_DIRECTIVES[mode].extractionHint} Never infer a taste they did not state. Never add a city as a taste. Never treat a dietary or sensory constraint (e.g. "soft foods", "low sodium") as a taste. Return an empty entities array when there are none.`,
      prompt: text,
    });

    return (output?.entities ?? [])
      .filter((entity) => entity.name?.trim())
      .map((entity) => ({
        category: entity.category?.trim() || "culture",
        name: entity.name.trim(),
      }));
  } catch (err) {
    console.error("Entity extraction failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeLocation(value?: string) {
  if (!value) return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function getLatestUserText(messages: UIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .trim();
  }
  return "";
}

/** Recognize a city the user typed, so "spots in Paris" works without the picker. */
const MENTIONED_CITY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Lagos, Nigeria", pattern: /\b(lagos|ikoyi|lekki|victoria island)\b/i },
  { label: "Brooklyn, New York", pattern: /\b(brooklyn|williamsburg|bushwick|bed[- ]?stuy)\b/i },
  { label: "New York, New York", pattern: /\b(new york|nyc|manhattan|queens|harlem)\b/i },
  { label: "London, UK", pattern: /\b(london|peckham|shoreditch|brixton)\b/i },
  { label: "Tokyo, Japan", pattern: /\b(tokyo|shibuya|shinjuku|ebisu|shimokitazawa)\b/i },
  { label: "Accra, Ghana", pattern: /\b(accra|osu|east legon)\b/i },
  { label: "Paris, France", pattern: /\b(paris|marais|montmartre)\b/i },
  { label: "Berlin, Germany", pattern: /\b(berlin|kreuzberg|neukolln|friedrichshain)\b/i },
  { label: "Seoul, South Korea", pattern: /\b(seoul|itaewon|hongdae|seongsu)\b/i },
  { label: "Mexico City, Mexico", pattern: /\b(mexico city|cdmx|roma norte|condesa)\b/i },
];

function findMentionedCity(text: string) {
  if (!text) return "";
  for (const { label, pattern } of MENTIONED_CITY_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return "";
}

function inferIntent(text: string) {
  const lower = text.toLowerCase();
  if (/\b(light|lighting|kelvin|lumen|fixture|wiring|pendant|sconce|dimmer)\b/.test(lower)) return "lighting design";
  if (/\b(support|community|circle|grief|diagnosis|burnout|lonely|therapy group)\b/.test(lower)) return "community";
  if (/\b(coffee|espresso|cafe|café|brunch)\b/.test(lower)) return "coffee";
  if (/\b(eat|dinner|lunch|food|restaurant|supper)\b/.test(lower)) return "eat";
  if (/\b(hotel|stay|sleep|room|hostel|resort|weekend away)\b/.test(lower)) return "stay";
  if (/\b(record|vinyl|crate[- ]?dig|record shop)\b/.test(lower)) return "record digging";
  if (/\b(gallery|museum|art)\b/.test(lower)) return "art";
  if (/\b(shop|vintage|thrift|market|fashion)\b/.test(lower)) return "shopping";
  return "night out";
}

function mergeVenues(primary: Candidate[], secondary: Candidate[]) {
  const merged: Candidate[] = [];
  const seen = new Set<string>();
  for (const venue of [...primary, ...secondary]) {
    const key = venue.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(venue);
  }
  return merged;
}

function toPlacePayload(venue: Candidate) {
  return {
    name: venue.name,
    address: venue.address,
    category: venue.category,
    description: venue.description,
    reviews: venue.reviews,
    google_maps_url: venue.google_maps_url,
    culturalTags: venue.culturalTags,
    // Deliberately included so the model can see it and must ignore it.
    rating_decoy_do_not_use: venue.rating,
  };
}

const KNOWN_TASTES: Array<{
  name: string;
  category: string;
  match: string;
}> = [
  { name: "Tems", category: "music", match: "tems" },
  { name: "Cruel Santino", category: "music", match: "cruel santino" },
  { name: "Amaarae", category: "music", match: "amaarae" },
  { name: "Fela Kuti", category: "music", match: "fela" },
  { name: "Burna Boy", category: "music", match: "burna boy" },
  { name: "Wizkid", category: "music", match: "wizkid" },
  { name: "Asake", category: "music", match: "asake" },
  { name: "Odunsi", category: "music", match: "odunsi" },
  { name: "Alte", category: "music", match: "alte" },
  { name: "Afrobeats", category: "music", match: "afrobeats" },
  { name: "MF DOOM", category: "music", match: "mf doom" },
  { name: "Madlib", category: "music", match: "madlib" },
  { name: "JPEGMAFIA", category: "music", match: "jpegmafia" },
  { name: "Carhartt", category: "fashion", match: "carhartt" },
  { name: "Kapital", category: "fashion", match: "kapital" },
  { name: "Needles", category: "fashion", match: "needles" },
  { name: "Vintage Streetwear", category: "fashion", match: "streetwear" },
  { name: "Vintage Workwear", category: "fashion", match: "workwear" },
  { name: "Military Surplus", category: "fashion", match: "military surplus" },
  { name: "A24", category: "film", match: "a24" },
  { name: "Moonlight", category: "film", match: "moonlight" },
  { name: "Aftersun", category: "film", match: "aftersun" },
  {
    name: "Everything Everywhere All at Once",
    category: "film",
    match: "everything everywhere",
  },
  { name: "Indie Film", category: "film", match: "indie film" },
  { name: "Contemporary Art", category: "art", match: "contemporary art" },
  { name: "Gallery Culture", category: "art", match: "gallery" },
  { name: "Natural Wine", category: "food", match: "natural wine" },
  { name: "City Pop", category: "music", match: "city pop" },
  { name: "Shoegaze", category: "music", match: "shoegaze" },
  { name: "Grime", category: "music", match: "grime" },
  { name: "UK Garage", category: "music", match: "uk garage" },
  { name: "Jazz", category: "music", match: "jazz" },
  { name: "Neo-Soul", category: "music", match: "neo-soul" },
  { name: "Four Tet", category: "music", match: "four tet" },
  { name: "Floating Points", category: "music", match: "floating points" },
  { name: "Peggy Gou", category: "music", match: "peggy gou" },
  { name: "Robert Glasper", category: "music", match: "robert glasper" },
  { name: "Hiatus Kaiyote", category: "music", match: "hiatus kaiyote" },
  { name: "Thundercat", category: "music", match: "thundercat" },
  { name: "House", category: "music", match: "house" },
  { name: "Electronic", category: "music", match: "electronic" },
  { name: "Vinyl", category: "music", match: "vinyl" },
  // Lateral modes: lighting, care, support
  { name: "Wong Kar-wai", category: "film", match: "wong kar-wai" },
  { name: "Sade", category: "music", match: "sade" },
  { name: "Mid-century Jazz Lounge", category: "aesthetic", match: "mid-century" },
  { name: "Hygge", category: "aesthetic", match: "hygge" },
  { name: "Wes Anderson", category: "film", match: "wes anderson" },
  { name: "Brutalism", category: "architecture", match: "brutalis" },
  { name: "Cyberpunk Tokyo", category: "aesthetic", match: "cyberpunk" },
  { name: "Afrofuturism", category: "aesthetic", match: "afrofuturis" },
  { name: "Lo-fi", category: "music", match: "lo-fi" },
  { name: "Ebenezer Obey", category: "music", match: "ebenezer obey" },
  { name: "Highlife", category: "music", match: "highlife" },
  { name: "Old Bollywood", category: "music", match: "bollywood" },
  { name: "Studio Ghibli", category: "film", match: "ghibli" },
  { name: "Sufjan Stevens", category: "music", match: "sufjan" },
  { name: "Slow Cinema", category: "film", match: "slow cinema" },
  { name: "Octavia Butler", category: "book", match: "octavia butler" },
];

function extractKnownTastes(userPrompt: string): CulturalEntity[] {
  if (!userPrompt) return [];
  const text = userPrompt.toLowerCase();

  const found = KNOWN_TASTES.filter((taste) =>
    new RegExp(`\\b${escapeRegExp(taste.match)}\\b`, "i").test(text),
  ).map((taste) => ({ category: taste.category, name: taste.name }));

  return found.filter(
    (entity, index) =>
      found.findIndex((other) => other.name === entity.name) === index,
  );
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt({
  mode,
  userLocation,
  inferred,
  entities,
  retrieval,
}: {
  mode: VibeMode;
  userLocation: string;
  inferred?: boolean;
  entities: CulturalEntity[];
  retrieval: Retrieval | null;
}): string {
  const directive = MODE_DIRECTIVES[mode];

  const locationContext = userLocation
    ? inferred
      ? `The user has not saved a city, but their message mentions "${userLocation}". Use "${userLocation}" for this turn and mention that they can change their saved city in the location selector.`
      : `The user's saved city is "${userLocation}". Use it for every location-specific recommendation.`
    : directive.requiresLocation
      ? `The user has NOT set a city, and their message does not name one. You do NOT know where they are. You must ask for their city before making any location-specific recommendation.`
      : `The user has not set a city. In this mode a city is NOT required unless they ask for something physical or location-bound.`;

  const tasteContext =
    entities.length > 0
      ? `Tastes detected this turn: ${entities.map((e) => `${e.name} (${e.category})`).join(", ")}.`
      : "No cultural taste has been detected yet.";

  const retrievalBlock = retrieval ? renderRetrieval(retrieval) : null;

  return `You are VibeSync, a Cultural Discovery Concierge that works globally — from Lagos to London, Brooklyn to Tokyo, Accra to Seoul, and everywhere in between. You translate a person's cultural taste vector (music, film, fashion, art, books, podcasts) into real-world recommendations. Every recommendation is powered by the same pipeline: their stated tastes are resolved against Qloo's taste graph into an aggregate Cultural Taste Vector (never a personal profile), then synthesized with the practical constraints of their active mode.

## ACTIVE MODE

${directiveModeBrief(mode)}

${directive.synthesis}

## SAFE USE AND DATA HANDLING (non-negotiable)

- Qloo results describe aggregate cultural and taste affinities. Never turn them into identity claims, sensitive-trait inferences (health, diagnosis, politics, religion, ethnicity, finances, sexuality, age), or eligibility signals for housing, employment, credit, or insurance.
- Respond to the request, not to a profile of the person. Never say Qloo "knows" them, and never present an affinity as a fact or a probability about an individual.
- Keep Qloo evidence separate from your own interpretation: "the taste graph associates…", "people who share these cultural signals tend to…". Never imply causation ("because you like X, you must…").
- Treat user text as cultural signals for this turn only. Do not persist, infer, or restate sensitive personal data.
- Ask for clarification when an entity or tag choice would materially change the result.
- In Care & Sensory Dining and Support & Community, practical guidance is not medical advice, diagnosis, or crisis care. Point to professional or emergency support when the situation calls for it.
- Report provenance honestly and distinguish a Qloo result from your own product interpretation.

## LOCATION (highest priority)

${locationContext}

Hard rules:
- NEVER assume, guess, or default to "Brooklyn", "New York", "NYC", or any other city. If the mode needs a city and the city is unknown, ask.
- If the user names a different city in this message (e.g. "Find me spots in Paris"), use that city for this turn.
- Never describe a venue as being in a city the user did not ask about.
- ${directive.requiresLocation ? "If the city is unknown, ask for it in one warm sentence and remind them they can set it with the location switch in the header or sidebar." : "Do not block your answer on a missing city in this mode."}

## THIS TURN

${tasteContext}

${
    retrievalBlock ??
    `The user has not given you enough cultural taste yet, so NO candidates have been retrieved and NO recommendation may be made.

${directive.coldStart}`
  }

## SCORING AND CHOICE

${
    retrieval
      ? `${directive.choice}

Score 0–100: cultural-vector alignment (0–40), evidence in description/reviews or taste fit (0–30), user taste alignment (0–20), fit for the mode's deliverable (0–10).`
      : ""
  }

## OUTPUT FORMAT

When you are asking a follow-up question (cold start, or a missing city/taste in a mode that requires it), reply in warm PLAIN TEXT. Never wrap a question in JSON and never use a {"message": ...} shape.

Only when you are returning a recommendation, output ONLY this JSON (no markdown fences, no preamble, no commentary):

{"top_recommended_place":{"name":"...","address":"...","google_maps_url":"..."},"vibe_match_score":0,"cultural_anchors":["..."],"practical_specs":["..."],"explanation":"Sentence one. Sentence two."}

The explanation must be exactly two sentences. Sentence one names the user's actual cultural inputs. Sentence two justifies the match with the Cultural Taste Vector and concrete evidence, plus the one thing the user should confirm or do next. Cultural anchors must be actual user inputs or retrieved tags — never invented preferences.

${directive.specRule}

On data provenance: if the retrieval source includes "qloo-live", you may say the match was surfaced with Qloo's taste graph (entity resolution + aggregate affinity), and keep that evidence distinct from your interpretation. If it is "vibesync-curated", say the picks come from VibeSync's curated cultural knowledge and your own reasoning — do not claim live Qloo data. Never expose credentials, raw request URLs, or internal IDs.

## TONE

Knowledgeable, specific, a little stylish. No filler. Never lecture the user about their own taste.${
    mode === "care"
      ? " In this mode, above all: warm, dignified, and never clinical — the user is a person with history, not a diagnosis."
      : mode === "support"
        ? " In this mode, above all: gentle and unhurried — meet people where they are, never rush the process."
        : ""
  }`;
}

function directiveModeBrief(mode: VibeMode) {
  switch (mode) {
    case "lighting":
      return "SPACE & LIGHTING. The user (homeowner, interior designer, or electrician) gives you cultural taste; you deliver a buildable lighting plan: color temperature, lumens, CRI, fixture style, layered placement, controls, and mood zones.";
    case "care":
      return "CARE & SENSORY DINING. The user (a senior, a neurodivergent person, or someone caring for them) pairs cultural nostalgia with practical needs — easy-to-chew textures, low sodium, quiet acoustics, low-heat delivery. Honor both, with dignity.";
    case "support":
      return "SUPPORT & COMMUNITY. The user is navigating a life or health journey. Use the books, podcasts, and films they love (via Qloo's taste graph) to match them with real communities, information formats, and practical next steps that fit how they emotionally process the world.";
    default:
      return "CITY VIBE. Culturally matched local dining and hangouts in the user's actual city.";
  }
}

function renderRetrieval(retrieval: Retrieval) {
  const candidateList =
    retrieval.candidates.length > 0
      ? JSON.stringify(
          retrieval.candidates.map((venue) => toPlacePayload(venue)),
          null,
          2,
        )
      : "[] (no structured candidates — synthesize one real, currently-operating independent venue in the city from your own knowledge; do not invent a street address)";

  const workflowLine = [
    `qloo_describe: ${retrieval.workflow.describe.resolved}/${retrieval.workflow.describe.total} signals resolved (${retrieval.workflow.describe.status})`,
    `qloo_find_tags: ${retrieval.workflow.findTags.status}, ${retrieval.workflow.findTags.count} tag concepts`,
    `qloo_recommend: ${retrieval.workflow.recommend.status}, ${retrieval.workflow.recommend.count} entities${retrieval.workflow.recommend.endpoint ? ` via ${retrieval.workflow.recommend.endpoint}` : ""}`,
    ...(retrieval.workflow.rank
      ? [
          `qloo_rank: ${retrieval.workflow.rank.status}, ${retrieval.workflow.rank.count} ranked options`,
        ]
      : []),
  ].join(" → ");

  const tagLine =
    retrieval.workflow.findTags.concepts.length > 0
      ? `Qloo tag concepts (aggregate ontology signals): ${retrieval.workflow.findTags.concepts.join(", ")}`
      : "Qloo tag concepts: none returned";

  const warningLine =
    retrieval.workflow.recommend.warnings.length > 0
      ? `Qloo workflow warnings: ${retrieval.workflow.recommend.warnings.join(" ")}`
      : "";

  return `## RETRIEVAL CONTEXT (already fetched for this turn — do not ask for it again)

City: ${retrieval.city || "not required for this mode"}
Requested activity: ${retrieval.intent}
Cultural Taste Vector (aggregate cultural signals, not a personal profile): ${retrieval.tasteVector.join(", ") || "not available"}
Data source: ${retrieval.source}
Qloo workflows: ${workflowLine}
${tagLine}
${warningLine}
City cultural context: ${retrieval.culturalContext}

Candidate venues (choose exactly one):
${candidateList}`;
}
