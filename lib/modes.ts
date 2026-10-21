/**
 * Lateral Mode Switcher — shared contract between the UI and the agent route.
 *
 * Every mode keeps the same pipeline (extract cultural entities → query Qloo →
 * synthesize) but changes what the synthesis produces:
 *
 * - `city`     — culturally matched local venues (dining, hangouts, culture).
 * - `lighting` — a buildable lighting plan translated from taste (Kelvin,
 *                lumens, CRI, fixture style, mood zones).
 * - `care`     — sensory-aware dining that honors nostalgia and physical needs
 *                (easy-to-chew, low sodium, quiet acoustics).
 * - `support`  — communities, information formats, and next steps matched to
 *                how a person emotionally processes the world.
 */
export type VibeMode = "city" | "lighting" | "care" | "support";

export const VIBE_MODES: VibeMode[] = ["city", "lighting", "care", "support"];

export const DEFAULT_VIBE_MODE: VibeMode = "city";

export function isVibeMode(value: unknown): value is VibeMode {
  return (
    value === "city" ||
    value === "lighting" ||
    value === "care" ||
    value === "support"
  );
}

/** Parse an untrusted wire value into a VibeMode, defaulting to `city`. */
export function parseVibeMode(value: unknown): VibeMode {
  return isVibeMode(value) ? value : DEFAULT_VIBE_MODE;
}

/** Labels + emoji used by the tab switcher in the UI. */
export const MODE_META: Record<
  VibeMode,
  { label: string; emoji: string; description: string }
> = {
  city: {
    label: "City Vibe",
    emoji: "🌆",
    description:
      "Culturally matched local dining & hangouts — Lagos to Brooklyn to Tokyo.",
  },
  lighting: {
    label: "Space & Lighting",
    emoji: "💡",
    description:
      "Translate film/music/brand taste into lighting specs: Kelvin, lumens, fixtures, mood zones.",
  },
  care: {
    label: "Care & Sensory Dining",
    emoji: "🍲",
    description:
      "Cultural nostalgia matched with real needs: soft textures, low sodium, quiet rooms.",
  },
  support: {
    label: "Support & Community",
    emoji: "🧭",
    description:
      "Books, podcasts & films matched to communities and next steps that fit how you process.",
  },
};
