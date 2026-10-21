/**
 * Live mode test for /api/chat — posts one prompt per mode and reconstructs
 * the streamed text so we can verify mode-specific synthesis + practical_specs.
 * Usage: node scripts/test-modes.mjs [mode ...]   (default: all four)
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3457";

const CASES = [
  {
    mode: "city",
    userLocation: "Lagos, Nigeria",
    text: "I listen to MF DOOM, wear vintage Carhartt, and love A24 movies. Where should I get coffee and hang out today?",
  },
  {
    mode: "lighting",
    userLocation: "",
    text: "My client loves Wong Kar-wai films, Sade, and mid-century jazz lounges. We are wiring their living room - what lighting setup and Kelvin specs should we install?",
  },
  {
    mode: "care",
    userLocation: "Lagos, Nigeria",
    text: "Planning a special dinner in Lagos for my 75-year-old dad who loves Ebenezer Obey and classic Highlife, but needs soft easy-to-chew foods, low sodium, and a quiet seating area.",
  },
  {
    mode: "support",
    userLocation: "",
    text: "Navigating a new chronic diagnosis and feeling overwhelmed by clinical jargon. I love Studio Ghibli films, warm storytelling podcasts, and gentle community spaces. Help me find my footing.",
  },
];

function extractText(raw) {
  const chunks = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload);
      if (event.type === "text-delta" && typeof event.delta === "string") {
        chunks.push(event.delta);
      }
    } catch {
      // ignore keep-alives / non-JSON lines
    }
  }
  return chunks.join("");
}

async function run({ mode, userLocation, text }) {
  const body = {
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
    provider: "groq",
    mode,
  };
  if (userLocation) body.userLocation = userLocation;

  const started = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const output = extractText(raw);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n=== MODE: ${mode} (${seconds}s) ===`);
  console.log(output.slice(0, 1500));
  try {
    const parsed = JSON.parse(output);
    console.log("--- parsed ---");
    console.log(
      JSON.stringify(
        {
          name: parsed.top_recommended_place?.name,
          address: parsed.top_recommended_place?.address,
          maps: parsed.top_recommended_place?.google_maps_url,
          score: parsed.vibe_match_score,
          anchors: parsed.cultural_anchors,
          specs: parsed.practical_specs,
        },
        null,
        2,
      ),
    );
  } catch {
    console.log("--- (plain text reply, not JSON — OK for cold starts) ---");
  }
}

const wanted = process.argv.slice(2);
const selected = wanted.length ? CASES.filter((c) => wanted.includes(c.mode)) : CASES;
for (const testCase of selected) {
  await run(testCase);
}
