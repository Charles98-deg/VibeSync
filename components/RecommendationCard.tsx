import {
  ArrowUpRight,
  AudioLines,
  Compass,
  HeartHandshake,
  Lightbulb,
  MapPin,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { VibeMode } from "@/lib/modes";
import { TiltCard3D } from "@/components/three-d";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Recommendation = {
  top_recommended_place: {
    name: string;
    address?: string | null;
    google_maps_url?: string | null;
  } | null;
  vibe_match_score: number | null;
  cultural_anchors: string[];
  practical_specs?: string[];
  explanation: string;
};

/** Per-mode visual language for the practical-specs panel and card eyebrow. */
const MODE_SPEC_STYLES: Record<
  VibeMode,
  {
    eyebrow: string;
    sectionLabel: string;
    icon: LucideIcon;
    iconClass: string;
    sectionClass: string;
    badgeClass: string;
  }
> = {
  city: {
    eyebrow: "Your cultural match",
    sectionLabel: "Practical notes",
    icon: MapPin,
    iconClass: "text-emerald-400",
    sectionClass: "border-zinc-800 bg-black/20",
    badgeClass: "border-zinc-700/70 bg-zinc-800/50 text-zinc-300",
  },
  lighting: {
    eyebrow: "Your taste, wired in",
    sectionLabel: "Lighting spec",
    icon: Lightbulb,
    iconClass: "text-amber-300",
    sectionClass: "border-amber-400/20 bg-amber-400/[0.05]",
    badgeClass: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  },
  care: {
    eyebrow: "Your comfort, considered",
    sectionLabel: "Care spec",
    icon: HeartHandshake,
    iconClass: "text-sky-300",
    sectionClass: "border-sky-400/20 bg-sky-400/[0.05]",
    badgeClass: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  },
  support: {
    eyebrow: "Your footing, found",
    sectionLabel: "Next steps",
    icon: Compass,
    iconClass: "text-violet-300",
    sectionClass: "border-violet-400/20 bg-violet-400/[0.05]",
    badgeClass: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  },
};

export function RecommendationCard({
  recommendation,
  mode = "city",
}: {
  recommendation: Recommendation;
  mode?: VibeMode;
}) {
  const place = recommendation.top_recommended_place;
  const score = recommendation.vibe_match_score;
  const specs = recommendation.practical_specs ?? [];
  const mapsUrl = getGoogleMapsUrl(place?.google_maps_url);
  const styles = MODE_SPEC_STYLES[mode];
  const SpecIcon = styles.icon;

  return (
    <TiltCard3D
      className="w-full max-w-[600px]"
      surfaceClassName="rounded-2xl"
      maxTilt={8}
    >
      <Card className="group relative w-full border-emerald-500/15 bg-[linear-gradient(150deg,#18181b_0%,#141416_55%,#0f0f11_100%)] text-zinc-100 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.95)] transition duration-500 [transform-style:preserve-3d] hover:border-emerald-500/30">
        {/* Decorative glow, clipped locally so the card stays 3D-flowing */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        >
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-24 size-64 rounded-full bg-emerald-500/[.07] blur-3xl transition duration-700 group-hover:bg-emerald-500/[.12]"
          />
        </div>
        <CardHeader className="relative grid-cols-[1fr_auto] items-start gap-4 p-5 [transform-style:preserve-3d] sm:p-6">
          <div className="min-w-0 [transform-style:preserve-3d]">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400 [transform:translateZ(26px)]">
              <Sparkles aria-hidden="true" className="size-3.5" /> {styles.eyebrow}
            </div>
            <CardTitle className="text-[22px] font-medium leading-tight tracking-[-0.04em] text-zinc-50 [transform:translateZ(34px)] sm:text-[25px]">
              {place?.name ?? "Your next spot"}
            </CardTitle>
            {place?.address && (
              <CardDescription className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-zinc-400 [transform:translateZ(28px)]">
                <MapPin
                  aria-hidden="true"
                  className="mt-1 size-3 shrink-0 text-zinc-500"
                />
                {place.address}
              </CardDescription>
            )}
          </div>
          {score !== null && (
            <Badge className="relative h-auto shrink-0 flex-col gap-1 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-right text-emerald-100 shadow-[0_0_28px_rgba(16,185,129,0.14)] [transform:translateZ(46px)] hover:bg-emerald-500/10">
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-300/80">
                Cultural affinity
              </span>
              <span className="text-[24px] font-semibold leading-none tracking-[-0.05em]">
                {score}
                <span className="text-[14px]">%</span>
              </span>
            </Badge>
          )}
        </CardHeader>

        <CardPanel className="relative flex flex-col gap-5 p-5 pt-0 [transform-style:preserve-3d] sm:p-6 sm:pt-0">
          <div
            aria-hidden="true"
            className="h-px bg-gradient-to-r from-emerald-500/25 via-white/[.06] to-transparent"
          />

          <p className="m-0 text-[10px] leading-relaxed text-zinc-500 [transform:translateZ(20px)]">
            <span className="font-medium text-emerald-400/80">
              Aggregate cultural affinity
            </span>{" "}
            — a signal overlap, not a personal profile, prediction, or
            diagnosis.
          </p>

          {recommendation.cultural_anchors.length > 0 && (
            <section
              aria-label="Qloo cultural signals"
              className="[transform:translateZ(26px)]"
            >
              <div className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                Qloo cultural signals
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recommendation.cultural_anchors.map((anchor) => (
                  <Badge
                    key={anchor}
                    variant="outline"
                    className="h-auto rounded-full border-zinc-700/70 bg-zinc-800/50 px-2.5 py-1 text-[10px] font-normal text-zinc-300"
                  >
                    {anchor}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {specs.length > 0 && (
            <section
              aria-label={styles.sectionLabel}
              className={cn(
                "rounded-2xl border p-4 [transform:translateZ(20px)]",
                styles.sectionClass,
              )}
            >
              <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                <SpecIcon
                  aria-hidden="true"
                  className={cn("size-3.5", styles.iconClass)}
                />
                {styles.sectionLabel}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {specs.map((spec) => (
                  <Badge
                    key={spec}
                    variant="outline"
                    className={cn(
                      "h-auto rounded-full px-2.5 py-1 text-[10px] font-normal",
                      styles.badgeClass,
                    )}
                  >
                    {spec}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4 [transform:translateZ(16px)]">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              <AudioLines aria-hidden="true" className="size-3.5 text-emerald-400" />
              Why it fits
            </div>
            <p className="m-0 text-[12px] leading-[1.8] text-zinc-300">
              {recommendation.explanation}
            </p>
          </div>

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-zinc-800 px-3 text-[10px] font-medium text-zinc-300 transition [transform:translateZ(30px)] hover:border-emerald-500/30 hover:bg-emerald-500/[.06] hover:text-emerald-300"
            >
              Open in Maps <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
          )}
        </CardPanel>
      </Card>
    </TiltCard3D>
  );
}

function getGoogleMapsUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["www.google.com", "maps.google.com"].includes(url.hostname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
