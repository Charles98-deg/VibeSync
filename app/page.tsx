"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowUp,
  AudioLines,
  Bookmark,
  Check,
  ChevronsUpDown,
  Compass,
  Globe,
  MapPin,
  PanelLeft,
  Search,
  Share2,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  RecommendationCard,
  type Recommendation,
} from "@/components/RecommendationCard";
import {
  AuroraBackground,
  GlowFrame,
  Levitate,
  TiltCard3D,
  useAmbientPointer,
} from "@/components/three-d";
import {
  MODE_META,
  VIBE_MODES,
  type VibeMode,
} from "@/lib/modes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const navItems = [
  { label: "Discover", icon: Compass },
  { label: "Saved", icon: Bookmark },
  { label: "Insights", icon: Sparkles },
];

/** Location presets — global cultural hubs */
const locationPresets = [
  { label: "Lagos, Nigeria", value: "Lagos, Nigeria", emoji: "🇳🇬" },
  { label: "Brooklyn, New York", value: "Brooklyn, New York", emoji: "🇺🇸" },
  { label: "London, UK", value: "London, UK", emoji: "🇬🇧" },
  { label: "Tokyo, Japan", value: "Tokyo, Japan", emoji: "🇯🇵" },
  { label: "Accra, Ghana", value: "Accra, Ghana", emoji: "🇬🇭" },
  { label: "Paris, France", value: "Paris, France", emoji: "🇫🇷" },
  { label: "Berlin, Germany", value: "Berlin, Germany", emoji: "🇩🇪" },
  { label: "Seoul, South Korea", value: "Seoul, South Korea", emoji: "🇰🇷" },
  { label: "Mexico City, Mexico", value: "Mexico City, Mexico", emoji: "🇲🇽" },
];

const LOCATION_STORAGE_KEY = "vibesync:location";


/** Taste chips + starter prompts per lateral mode ("Build Your Vibe" pills). */
type ModeSuggestion = { label: string; prompt: string };
type ModeChip = { label: string; emoji: string; taste: string };

const modeContent: Record<
  VibeMode,
  { suggestions: ModeSuggestion[]; chips: ModeChip[] }
> = {
  city: {
    suggestions: [
      {
        label: "Find a coffee spot",
        prompt:
          "I listen to MF DOOM, wear vintage Carhartt, and love A24 movies. Where should I get coffee and hang out today?",
      },
      {
        label: "Plan my night out",
        prompt: "Plan my night out",
      },
      {
        label: "Dig for records",
        prompt:
          "I collect underground hip-hop on vinyl. Where can I crate-dig and hear it played out?",
      },
      {
        label: "Weekend itinerary",
        prompt:
          "I have a free Saturday. Put together a small itinerary that fits my taste.",
      },
    ],
    chips: [
      { label: "Afrobeats / Alte", emoji: "🎧", taste: "Afrobeats and Alte music (Tems, Cruel Santino, Amaarae)" },
      { label: "Underground Hip-Hop", emoji: "🎤", taste: "underground hip-hop (MF DOOM, Madlib, JPEGMAFIA)" },
      { label: "Vintage Streetwear", emoji: "🧥", taste: "vintage streetwear and workwear (Carhartt, Kapital, military surplus)" },
      { label: "A24 / Indie Film", emoji: "🎬", taste: "A24 and indie film (Moonlight, Everything Everywhere, Aftersun)" },
      { label: "Contemporary Art", emoji: "🎨", taste: "contemporary art and gallery culture" },
      { label: "Natural Wine", emoji: "🍷", taste: "natural wine and low-intervention drinks" },
      { label: "Jazz / Neo-Soul", emoji: "🎹", taste: "jazz and neo-soul (Robert Glasper, Hiatus Kaiyote, Thundercat)" },
      { label: "Electronic / House", emoji: "💿", taste: "electronic music and house (Four Tet, Floating Points, Peggy Gou)" },
    ],
  },
  lighting: {
    suggestions: [
      {
        label: "Light my client's living room",
        prompt:
          "My client loves Wong Kar-wai films, Sade, and mid-century jazz lounges. We are wiring their living room—what lighting setup and Kelvin specs should we install?",
      },
      {
        label: "Tokyo listening-bar room",
        prompt:
          "I want my living room to feel like a Tokyo listening bar — vinyl jazz, amber valve-amp glow, late-night calm. Give me the full lighting plan: fixtures, Kelvin, lumens, and mood zones.",
      },
      {
        label: "Hygge reading nook",
        prompt:
          "Turn my reading nook into Scandinavian hygge — candle-warm, low contrast, zero glare. What fixtures, color temperature, and dimming should I install?",
      },
      {
        label: "Dinner party glow",
        prompt:
          "We host long dinner parties — natural wine, Bowie on vinyl. Design the dining lighting: pendant height, Kelvin for cooking versus dining, and dimming zones.",
      },
    ],
    chips: [
      { label: "Wong Kar-wai Neon", emoji: "🌆", taste: "Wong Kar-wai films — saturated neon, rain-soaked streets, short-throw shadows" },
      { label: "Sade / Jazz Lounge", emoji: "🎷", taste: "Sade and mid-century jazz lounges — amber, unhurried, smoked glass" },
      { label: "Scandi Hygge", emoji: "🕯️", taste: "Scandinavian hygge — candle-warm, low-contrast, no glare" },
      { label: "Wes Anderson Pastel", emoji: "🎨", taste: "Wes Anderson symmetry and pastel palettes" },
      { label: "Brutalist Calm", emoji: "🧱", taste: "Brutalist architecture — raw concrete and one dramatic light source" },
      { label: "Cyberpunk Tokyo", emoji: "🤖", taste: "cyberpunk Tokyo — layered neon signage and cool magenta accents" },
      { label: "Afrofuturism", emoji: "🛸", taste: "Afrofuturism — Sun Ra cosmic warmth, brass tones, and deep color" },
      { label: "Golden Hour", emoji: "🌅", taste: "golden-hour warmth like a Terrence Malick film" },
    ],
  },
  care: {
    suggestions: [
      {
        label: "Dinner for my 75-year-old dad",
        prompt:
          "Planning a special dinner in Lagos for my 75-year-old dad who loves Ebenezer Obey and classic Highlife, but needs soft easy-to-chew foods, low sodium, and a quiet seating area.",
      },
      {
        label: "Quiet lunch spot",
        prompt:
          "Find me a quiet, low-stimulation lunch spot in Brooklyn — loud rooms overwhelm me, I calm down with Sade and Studio Ghibli, and I need simple, soft foods on the menu.",
      },
      {
        label: "Post-surgery family dinner",
        prompt:
          "My mom is recovering from surgery and can only manage soft foods. She loves old Bollywood songs and creamy desserts — where in London can we take her that won't feel like a hospital version of a night out?",
      },
      {
        label: "Sensory-safe delivery night",
        prompt:
          "Ordering in for my neurodivergent kid who prefers mild, familiar flavors and no surprises, and settles with lo-fi. Build a delivery plan: soft textures, sauces on the side, packaging that arrives warm not soggy.",
      },
    ],
    chips: [
      { label: "Soft & easy to chew", emoji: "🥣", taste: "soft, easy-to-chew textures (stews and mashed bases, no crusty bread)" },
      { label: "Low sodium", emoji: "🧂", taste: "low-sodium cooking (kitchen holds the added salt)" },
      { label: "Quiet seating", emoji: "🤫", taste: "a quiet, low-stimulation seating area away from speakers" },
      { label: "Nostalgic classics", emoji: "📻", taste: "nostalgic favorites — Highlife, soul, and old family records" },
      { label: "Mild, low heat", emoji: "🌶️", taste: "mild, low-heat flavors with sauces on the side" },
      { label: "Familiar dishes", emoji: "🍚", taste: "familiar childhood dishes over novelty" },
      { label: "Calm rooms", emoji: "🛋️", taste: "calm rooms — soft light, no loud music, unhurried service" },
      { label: "Gentle delivery", emoji: "🛍️", taste: "low-heat delivery packaging that keeps soft foods intact" },
    ],
  },
  support: {
    suggestions: [
      {
        label: "Find my footing",
        prompt:
          "Navigating a new chronic diagnosis and feeling overwhelmed by clinical jargon. I love Studio Ghibli films, warm storytelling podcasts, and gentle community spaces. Help me find my footing.",
      },
      {
        label: "Grief, gently",
        prompt:
          "I lost my dad recently. Sufjan Stevens' Carrie & Lowell and slow cinema are the only things that reach me. Find me a grief community that doesn't do clinical checklists — quiet, warm, no pressure to talk.",
      },
      {
        label: "New city, no people yet",
        prompt:
          "Just moved to London and feel isolated. I love Heartstopper, baking podcasts, and Sunday markets. Help me find my people — small circles, low-pressure, in person.",
      },
      {
        label: "Burnout reset",
        prompt:
          "Burned out and cynical. I read Octavia Butler and listen to long-form interviews. Match me with communities and next steps that fit an introvert who processes by reading, not talking.",
      },
    ],
    chips: [
      { label: "Ghibli warmth", emoji: "🌿", taste: "Studio Ghibli films and warm, hand-drawn worlds" },
      { label: "Story podcasts", emoji: "🎙️", taste: "gentle storytelling podcasts" },
      { label: "Warm memoirs", emoji: "📖", taste: "warm, hopeful memoirs" },
      { label: "Slow cinema", emoji: "🎞️", taste: "slow cinema and quiet films" },
      { label: "Nature writing", emoji: "🍂", taste: "nature writing and quiet essays" },
      { label: "Small circles", emoji: "🪑", taste: "small, low-pressure community circles (10 people at most)" },
      { label: "Plain language", emoji: "🫧", taste: "plain-language information, no clinical jargon" },
      { label: "Cozy spaces", emoji: "🧸", taste: "cozy, softly lit community spaces" },
    ],
  },
};

const chatGroups = [
  {
    label: "Today",
    items: [
      { id: "c1", title: "Lagos Afrobeats night" },
      { id: "c2", title: "A24 double-feature night" },
    ],
  },
  {
    label: "Previous 7 days",
    items: [
      { id: "c3", title: "Vintage Carhartt fits" },
      { id: "c4", title: "Tokyo listening bars" },
      { id: "c5", title: "Shimokitazawa record stores" },
      { id: "c6", title: "Natural wine + vinyl" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Home() {
  const [input, setInput] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeChat, setActiveChat] = useState("c1");
  // Lateral mode: city vibe, lighting design, sensory dining, support.
  const [mode, setMode] = useState<VibeMode>("city");
  // No hardcoded city: first-time users start unset and are asked to choose.
  const [userLocation, setUserLocation] = useState("");
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showHeaderLocationPicker, setShowHeaderLocationPicker] = useState(false);
  const [customLocationInput, setCustomLocationInput] = useState("");
  const [selectedChips, setSelectedChips] = useState<Set<number>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const locationPickerRef = useRef<HTMLDivElement>(null);
  const headerLocationPickerRef = useRef<HTMLDivElement>(null);
  const locationLabel = userLocation || "Set your city";
  useAmbientPointer();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { userLocation, mode },
      }),
    [userLocation, mode],
  );
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });
  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore the saved city after mount (keeps SSR markup stable).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCATION_STORAGE_KEY)?.trim();
      if (saved) setUserLocation(saved);
    } catch {
      // Private-mode or storage disabled — stay unset.
    }
  }, []);

  useEffect(() => {
    if (!userLocation) return;
    try {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, userLocation);
    } catch {
      // Storage is optional; the in-memory value still works.
    }
  }, [userLocation]);

  // Close location pickers on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        showLocationPicker &&
        locationPickerRef.current &&
        !locationPickerRef.current.contains(target)
      ) {
        setShowLocationPicker(false);
      }
      if (
        showHeaderLocationPicker &&
        headerLocationPickerRef.current &&
        !headerLocationPickerRef.current.contains(target)
      ) {
        setShowHeaderLocationPicker(false);
      }
    }
    if (showLocationPicker || showHeaderLocationPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showLocationPicker, showHeaderLocationPicker]);

  const title = useMemo(() => {
    const firstUser = messages.find((message) => message.role === "user");
    const text = firstUser?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    return text ? text.slice(0, 48) : "New conversation";
  }, [messages]);

  async function submit(event?: FormEvent, content = input) {
    event?.preventDefault();
    const text = content.trim();
    if (!text || isBusy) return;
    setInput("");
    setSelectedChips(new Set());
    await sendMessage({ text });
  }

  /** Fill the composer with a suggestion so the user can review it before sending. */
  function applyPrompt(text: string) {
    setInput(text);
    composerRef.current?.focus();
  }

  function startNewChat() {
    setMessages([]);
    setInput("");
    setActiveChat("");
    setSelectedChips(new Set());
    composerRef.current?.focus();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function selectPresetLocation(value: string) {
    setUserLocation(value);
    setShowLocationPicker(false);
    setShowHeaderLocationPicker(false);
    setCustomLocationInput("");
  }

  function submitCustomLocation() {
    const city = customLocationInput.trim();
    if (city) {
      setUserLocation(city);
      setShowLocationPicker(false);
      setShowHeaderLocationPicker(false);
      setCustomLocationInput("");
    }
  }

  function toggleChip(index: number) {
    const chip = modeContent[mode].chips[index];
    const isSelected = selectedChips.has(index);
    const next = new Set(selectedChips);
    if (isSelected) next.delete(index);
    else next.add(index);
    setSelectedChips(next);

    setInput((current) =>
      isSelected ? removeTaste(current, chip.taste) : appendTaste(current, chip.taste),
    );
    composerRef.current?.focus();
  }

  /** Switch lateral mode; chip selections don't carry across modes. */
  function switchMode(next: VibeMode) {
    if (next === mode) return;
    setMode(next);
    setSelectedChips(new Set());
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar ---------------------------------------------------------- */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-[width] duration-200 md:flex",
          showSidebar ? "w-[260px]" : "w-0 border-r-0",
        )}
      >
        {showSidebar && (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
              <a
                href="#"
                aria-label="VibeSync home"
                className="flex min-w-0 items-center gap-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500 text-zinc-950 shadow-[0_0_22px_-6px_rgba(16,185,129,0.85)]">
                  <AudioLines
                    aria-hidden="true"
                    className="size-4.5"
                    strokeWidth={2.5}
                  />
                </span>
                <span className="truncate text-[15px] font-semibold tracking-[-0.03em] text-zinc-100">
                  VibeSync
                </span>
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Collapse sidebar"
                onClick={() => setShowSidebar(false)}
                className="shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <PanelLeft aria-hidden="true" />
              </Button>
            </div>

            <div className="px-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={startNewChat}
                className="h-9 w-full justify-start gap-2.5 rounded-lg border-zinc-800 bg-zinc-950/40 px-3 text-[13px] font-medium text-zinc-200 shadow-none hover:border-zinc-700 hover:bg-zinc-800/70"
              >
                <SquarePen aria-hidden="true" className="size-4 text-emerald-400" />
                New chat
                <span className="ms-auto text-[10px] font-normal tracking-wide text-zinc-500">
                  ⌘K
                </span>
              </Button>
            </div>

            <nav aria-label="Workspace" className="mt-4 flex flex-col gap-0.5 px-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.label}
                    type="button"
                    variant="ghost"
                    className="h-9 w-full justify-start gap-2.5 rounded-lg px-3 text-[13px] font-normal text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    <Icon aria-hidden="true" className="size-4 text-zinc-500" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>

            <div className="feed-scroll mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2">
              {chatGroups.map((group) => (
                <div key={group.label} className="mt-3 first:mt-0">
                  <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                    {group.label}
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setActiveChat(item.id)}
                          aria-current={
                            activeChat === item.id ? "true" : undefined
                          }
                          className={cn(
                            "h-auto w-full min-w-0 justify-start rounded-lg px-3 py-2 text-left text-[13px] font-normal text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                            activeChat === item.id &&
                              "bg-zinc-800 text-zinc-100",
                          )}
                        >
                          <span className="truncate">{item.title}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Interactive Location Selector ("Your space: Brooklyn, New York" upgraded) */}
            <div className="relative shrink-0 border-t border-zinc-800 p-3" ref={locationPickerRef}>
              <GlowFrame radius={130} color="rgba(16,185,129,0.45)" className="w-full rounded-lg">
                <button
                type="button"
                onClick={() => setShowLocationPicker((prev) => !prev)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-800",
                  showLocationPicker && "bg-zinc-800/80 ring-1 ring-emerald-500/30",
                )}
                aria-label={`Current space: ${locationLabel}. Click to change city.`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-800 text-[11px] font-semibold text-emerald-400 ring-1 ring-zinc-700">
                  <MapPin className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-zinc-200">
                    Your space
                  </span>
                  <span
                    className={cn(
                      "block truncate text-[11px]",
                      userLocation ? "text-zinc-400" : "text-emerald-400",
                    )}
                  >
                    {locationLabel}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-zinc-500" />
              </button>
              </GlowFrame>

              {showLocationPicker && (
                <LocationSelectorPopup
                  userLocation={userLocation}
                  onSelectPreset={selectPresetLocation}
                  customInput={customLocationInput}
                  onCustomInputChange={setCustomLocationInput}
                  onSubmitCustom={submitCustomLocation}
                  onClose={() => setShowLocationPicker(false)}
                  align="bottom"
                />
              )}
            </div>
          </>
        )}
      </aside>

      {/* Main chat area --------------------------------------------------- */}
      <section className="relative flex min-w-0 flex-1 flex-col bg-zinc-950">
        <AuroraBackground className="absolute inset-0 -z-10" />
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500 text-zinc-950 md:hidden">
              <AudioLines aria-hidden="true" className="size-4" />
            </span>
            {!showSidebar && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Open sidebar"
                onClick={() => setShowSidebar(true)}
                className="shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <PanelLeft aria-hidden="true" />
              </Button>
            )}
            {!showSidebar && (
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500 text-zinc-950">
                <AudioLines aria-hidden="true" className="size-4" />
              </span>
            )}
            <h1 className="truncate text-[13px] font-medium text-zinc-200">
              {title}
            </h1>
            <Badge
              variant="outline"
              className="hidden shrink-0 border-zinc-800 bg-zinc-900 text-[10px] font-medium text-emerald-400 sm:inline-flex"
            >
              Cultural AI
            </Badge>
          </div>
          <div className="relative flex shrink-0 items-center gap-1" ref={headerLocationPickerRef}>
            {/* Interactive location badge in header */}
            <GlowFrame radius={120} color="rgba(16,185,129,0.45)" className="w-fit shrink-0 rounded-full">
              <button
                type="button"
                onClick={() => setShowHeaderLocationPicker((prev) => !prev)}
                aria-label={`Current location: ${locationLabel}. Click to change.`}
                className={cn(
                  "mr-1 flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-zinc-300 transition-colors hover:border-emerald-500/40 hover:bg-zinc-800 hover:text-emerald-300",
                  !userLocation && "border-emerald-500/30 text-emerald-300",
                  showHeaderLocationPicker && "border-emerald-500/40 bg-zinc-800 text-emerald-300",
                )}
              >
                <MapPin aria-hidden="true" className="size-3 text-emerald-400" />
                <span className="max-w-[130px] truncate text-[11px]">
                  {locationLabel}
                </span>
                <ChevronsUpDown aria-hidden="true" className="size-3 text-zinc-500" />
              </button>
            </GlowFrame>

            {showHeaderLocationPicker && (
              <LocationSelectorPopup
                userLocation={userLocation}
                onSelectPreset={selectPresetLocation}
                customInput={customLocationInput}
                onCustomInputChange={setCustomLocationInput}
                onSubmitCustom={submitCustomLocation}
                onClose={() => setShowHeaderLocationPicker(false)}
                align="top"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Search conversations"
              className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Search aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Share conversation"
              className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Share2 aria-hidden="true" />
            </Button>
          </div>
        </header>

        {/* Lateral Mode Switcher ------------------------------------------- */}
        <div className="relative z-10 shrink-0 border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-sm">
          <nav
            aria-label="Lateral mode"
            className="feed-scroll mx-auto flex w-full max-w-3xl items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6"
          >
            <span className="me-1 hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600 md:inline">
              Mode
            </span>
            {VIBE_MODES.map((modeId) => {
              const meta = MODE_META[modeId];
              const isActive = mode === modeId;
              return (
                <button
                  key={modeId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={meta.description}
                  onClick={() => switchMode(modeId)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-all",
                    isActive
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_18px_-6px_rgba(16,185,129,0.6)]"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/70 hover:text-zinc-200",
                  )}
                >
                  <span aria-hidden="true">{meta.emoji}</span>
                  <span className="whitespace-nowrap">{meta.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Scrollable feed */}
        <div className="feed-scroll relative min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState
              onSelect={applyPrompt}
              userLocation={userLocation}
              mode={mode}
              onChooseLocation={() => {
                setShowLocationPicker(false);
                setShowHeaderLocationPicker(true);
              }}
            />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
              {messages.map((message) => {
                const text = message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("");
                const isUser = message.role === "user";
                const recommendation = isUser
                  ? null
                  : parseRecommendation(text);
                const pendingJson =
                  isBusy && !isUser && text.trimStart().startsWith("{");

                if (isUser) {
                  return (
                    <div key={message.id} className="fade-in flex justify-end">
                      <div className="max-w-[min(85%,34rem)] whitespace-pre-wrap rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-[0_12px_34px_-18px_rgba(5,150,105,0.95)]">
                        {text}
                      </div>
                    </div>
                  );
                }

                return (
                  <article key={message.id} className="fade-in flex gap-3">
                    <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-800 text-emerald-400 ring-1 ring-zinc-800">
                      <AudioLines
                        aria-hidden="true"
                        className="size-4"
                        strokeWidth={2.4}
                      />
                    </div>
                    {recommendation ? (
                      <RecommendationCard
                        recommendation={recommendation}
                        mode={mode}
                      />
                    ) : pendingJson ? null : (
                      <div className="message-copy max-w-[min(88%,42rem)] rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-800/50 px-4 py-3 text-[14px] leading-relaxed text-zinc-200">
                        {message.parts.map((part, index) =>
                          part.type === "text" ? (
                            <p
                              key={`${message.id}-${index}`}
                              className="whitespace-pre-wrap"
                            >
                              {part.text}
                            </p>
                          ) : null,
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              {isBusy && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 pl-11 text-[12px] text-zinc-500"
                >
                  <span className="flex gap-1">
                    <i className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <i className="size-1.5 rounded-full bg-emerald-400 animate-pulse [animation-delay:150ms]" />
                    <i className="size-1.5 rounded-full bg-emerald-400 animate-pulse [animation-delay:300ms]" />
                  </span>
                  {modeBusyLine(mode, locationLabel)}
                </div>
              )}

              {error && (
                <div className="ml-11 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-[13px] leading-relaxed text-rose-300">
                  {error.message ||
                    "Something went wrong. Check your API key and try again."}
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Sticky composer */}
        <div className="sticky bottom-0 z-20 shrink-0 border-t border-zinc-800 bg-zinc-950/80 px-4 py-4 backdrop-blur-md sm:px-6">
          {/* Vibe chips — shown when chat is empty */}
          {messages.length === 0 && (
            <div className="mx-auto mb-3 flex w-full max-w-3xl flex-wrap items-center justify-center gap-1.5">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                Build your vibe
              </span>
              {modeContent[mode].chips.map((chip, index) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => toggleChip(index)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-all",
                    selectedChips.has(index)
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_14px_-6px_rgba(16,185,129,0.5)]"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/70 hover:text-zinc-200",
                  )}
                >
                  <span>{chip.emoji}</span>
                  <span>{chip.label}</span>
                  {selectedChips.has(index) && (
                    <Check aria-hidden="true" className="size-3 text-emerald-400" />
                  )}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
            <GlowFrame radius={280} color="rgba(16,185,129,0.45)" className="rounded-2xl">
            <div className="composer-focus flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2 shadow-[0_20px_60px_-36px_rgba(0,0,0,0.95)]">
              <Textarea
                ref={composerRef}
                unstyled
                aria-label="Message VibeSync"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={1}
                placeholder={
                  userLocation
                    ? `Ask VibeSync anything about ${userLocation}…`
                    : "Ask VibeSync anything — set your city for local picks…"
                }
                className="composer-field block w-full"
              />
              <div className="mt-1 flex items-center justify-between gap-2 px-1">
                <span className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/50 px-2.5 text-[12px] text-zinc-300">
                  <Sparkles
                    aria-hidden="true"
                    className="size-3 text-emerald-400"
                  />
                  Gemini 3 Flash
                </span>

                <div className="flex items-center gap-1.5">
                  {messages.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={startNewChat}
                      aria-label="Clear conversation"
                      className="text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || isBusy}
                    aria-label="Send message"
                    className="rounded-xl shadow-[0_0_26px_-8px_rgba(16,185,129,0.95)] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:opacity-100 disabled:shadow-none"
                  >
                    <ArrowUp aria-hidden="true" strokeWidth={2.4} />
                  </Button>
                </div>
              </div>
            </div>
            </GlowFrame>
            <p className="mt-2.5 text-center text-[11px] text-zinc-500">
              {modeFootnote(mode, userLocation)}
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  onSelect,
  userLocation,
  mode,
  onChooseLocation,
}: {
  onSelect: (prompt: string) => void;
  userLocation: string;
  mode: VibeMode;
  onChooseLocation: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
      <span className="fade-in inline-block">
        <Levitate depth={34} floatPx={5} duration={7} parallax={0.9}>
          <span className="grid size-12 place-items-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-[0_0_44px_-14px_rgba(16,185,129,0.7)]">
            <Sparkles aria-hidden="true" className="size-5.5" />
          </span>
        </Levitate>
      </span>
      <h2 className="fade-in mt-6 max-w-[30ch] text-balance text-[clamp(26px,4vw,38px)] font-medium leading-[1.1] tracking-[-0.035em] text-zinc-50">
        Tell us what you&rsquo;re into. We&rsquo;ll find where you belong.
      </h2>
      <p className="fade-in mt-4 max-w-[48ch] text-[14px] leading-relaxed text-zinc-400">
        {modeHeroCopy(mode, userLocation)}
      </p>

      {!userLocation && mode === "city" && (
        <Button
          type="button"
          variant="outline"
          onClick={onChooseLocation}
          className="fade-in mt-5 h-9 rounded-full border-emerald-500/30 bg-emerald-500/10 px-4 text-[13px] font-medium text-emerald-300 shadow-none hover:border-emerald-500/50 hover:bg-emerald-500/15"
        >
          <MapPin aria-hidden="true" className="size-3.5" />
          Set your city
          <span className="text-[11px] font-normal text-emerald-400/70">
            Lagos · London · Tokyo · anywhere
          </span>
        </Button>
      )}

      <div className="fade-in mt-8 flex w-full flex-wrap items-center justify-center gap-2">
        {modeContent[mode].suggestions.map((suggestion) => (
          <TiltCard3D
            key={suggestion.label}
            maxTilt={5}
            glare={false}
            borderGlow={false}
            depthGlow={false}
            surfaceClassName="rounded-full"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => onSelect(suggestion.prompt)}
              className="h-9 rounded-full border-zinc-800 bg-zinc-900/60 px-4 text-[13px] font-normal text-zinc-300 shadow-none hover:border-emerald-500/30 hover:bg-zinc-800 hover:text-emerald-300"
            >
              {suggestion.label}
            </Button>
          </TiltCard3D>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode-aware copy helpers
// ---------------------------------------------------------------------------

function modeHeroCopy(mode: VibeMode, userLocation: string) {
  if (mode === "lighting") {
    return (
      <>
        VibeSync starts from the films, records, and rooms you love, then turns
        them into a lighting plan you can actually build — Kelvin, lumens, CRI,
        and mood zones included.
      </>
    );
  }
  if (mode === "care") {
    return (
      <>
        VibeSync honors what you love and what your body needs — matching
        nostalgic music, dishes, and eras with texture, sodium, sound, and
        comfort.
      </>
    );
  }
  if (mode === "support") {
    return (
      <>
        VibeSync starts from the stories that hold you up, then finds
        communities, information formats, and next steps that speak your
        language.
      </>
    );
  }
  return (
    <>
      VibeSync starts from the music, style, and stories you love, then points
      you to the places{" "}
      {userLocation ? (
        <>
          in{" "}
          <span className="font-medium text-emerald-400">{userLocation}</span>{" "}
          that share your frequency.
        </>
      ) : (
        <>near you that share your frequency — wherever you are in the world.</>
      )}
    </>
  );
}

function modeBusyLine(mode: VibeMode, locationLabel: string) {
  switch (mode) {
    case "lighting":
      return "Mapping aggregate cultural signals to lighting specs";
    case "care":
      return locationLabel && locationLabel !== "Set your city"
        ? `Balancing taste, texture, and comfort in ${locationLabel}`
        : "Balancing taste, texture, and comfort";
    case "support":
      return "Matching your frequency to communities and formats";
    default:
      return `Reading your cultural signals and scanning ${locationLabel}`;
  }
}

function modeFootnote(mode: VibeMode, userLocation: string) {
  switch (mode) {
    case "lighting":
      return (
        <>
          VibeSync translates cultural signals into buildable lighting specs —
          Kelvin, CRI, lumens, and zones. Affinities are aggregate, not personal
          traits; verify loads and local code with your electrician.
        </>
      );
    case "care":
      return (
        <>
          VibeSync blends cultural nostalgia with texture, sodium, and acoustic
          needs. Affinities are aggregate and this is not medical advice —
          confirm dietary details with the venue.
        </>
      );
    case "support":
      return (
        <>
          VibeSync matches aggregate cultural affinities to communities and
          formats — not medical advice or a diagnosis. For urgent situations,
          contact local crisis services.
        </>
      );
    default:
      return userLocation ? (
        <>
          VibeSync blends your cultural signals with local picks in{" "}
          <span className="text-zinc-400">{userLocation}</span>. Affinities are
          aggregate, not personal traits — confirm details before you head out.
        </>
      ) : (
        <>
          Set your city so VibeSync can match aggregate cultural signals to real
          spots near you.
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Add a vibe chip's taste into the composer without duplicating it. */
function appendTaste(text: string, taste: string) {
  const trimmed = text.trim();
  if (!trimmed) return `I'm into ${taste}. `;
  if (trimmed.toLowerCase().includes(taste.toLowerCase())) return text;
  if (/[.!?]$/.test(trimmed)) {
    return `${trimmed.slice(0, -1).replace(/[,;]+$/, "")}, and ${taste}. `;
  }
  return `${trimmed}, ${taste}. `;
}

/** Remove a vibe chip's taste and tidy any dangling commas/connectors. */
function removeTaste(text: string, taste: string) {
  const escaped = escapeRegExp(taste);
  const updated = text
    .replace(new RegExp(`,\\s*and\\s+${escaped}`, "gi"), "")
    .replace(new RegExp(`,\\s*${escaped}`, "gi"), "")
    .replace(new RegExp(escaped, "gi"), "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/,\s*and\s*(?=[.!?]|$)/gi, "")
    .replace(/(^|[,.]\s*)and\s+/gi, "$1")
    .replace(/^[\s,;]+/g, "")
    .replace(/^I'?m into\s*[,;.]?\s*/i, "")
    .replace(/[\s,;]+$/g, "")
    .trim();
  return /^[.,;!?\s]*$/.test(updated) ? "" : updated;
}

function parseRecommendation(text: string): Recommendation | null {
  try {
    const value = JSON.parse(text.trim()) as Partial<Recommendation>;
    if (!("top_recommended_place" in value) || typeof value.explanation !== "string")
      return null;

    const rawPlace = value.top_recommended_place;
    const place =
      rawPlace && typeof rawPlace === "object" && typeof rawPlace.name === "string"
        ? {
            name: rawPlace.name,
            address:
              typeof rawPlace.address === "string" ? rawPlace.address : null,
            google_maps_url:
              typeof rawPlace.google_maps_url === "string"
                ? rawPlace.google_maps_url
                : null,
          }
        : null;
    const rawScore = value.vibe_match_score;
    const score =
      typeof rawScore === "number" && Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : null;

    return {
      top_recommended_place: place,
      vibe_match_score: score,
      cultural_anchors: Array.isArray(value.cultural_anchors)
        ? value.cultural_anchors.filter(
            (anchor): anchor is string => typeof anchor === "string",
          )
        : [],
      practical_specs: Array.isArray(value.practical_specs)
        ? value.practical_specs.filter(
            (spec): spec is string => typeof spec === "string" && spec.trim().length > 0,
          )
        : [],
      explanation: value.explanation,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Interactive Location Selector Component
// ---------------------------------------------------------------------------

function LocationSelectorPopup({
  userLocation,
  onSelectPreset,
  customInput,
  onCustomInputChange,
  onSubmitCustom,
  onClose,
  align = "bottom",
}: {
  userLocation: string;
  onSelectPreset: (value: string) => void;
  customInput: string;
  onCustomInputChange: (val: string) => void;
  onSubmitCustom: () => void;
  onClose: () => void;
  align?: "bottom" | "top";
}) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Set your city"
      className={cn(
        "absolute z-50 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)] animate-in fade-in-0 zoom-in-95 duration-150",
        align === "bottom"
          ? "bottom-full left-3 right-3 mb-2"
          : "right-0 top-full mt-2 w-72 sm:right-0"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Globe aria-hidden="true" className="size-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300">
            Set your space
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close location selector"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Presets */}
      <div
        role="listbox"
        aria-label="Global cultural hubs"
        className="feed-scroll max-h-64 space-y-0.5 overflow-y-auto p-1.5"
      >
        <span className="block px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Global Cultural Hubs
        </span>
        {locationPresets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            role="option"
            aria-selected={userLocation === preset.value}
            onClick={() => onSelectPreset(preset.value)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
              userLocation === preset.value
                ? "bg-emerald-500/10 font-medium text-emerald-300"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
            )}
          >
            <span className="text-[14px]">{preset.emoji}</span>
            <span className="flex-1 truncate">{preset.label}</span>
            {userLocation === preset.value && (
              <Check aria-hidden="true" className="size-3.5 text-emerald-400" />
            )}
          </button>
        ))}
      </div>

      {/* Custom city input */}
      <div className="border-t border-zinc-800 p-2">
        <span className="block px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Any City Worldwide
        </span>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={customInput}
            onChange={(e) => onCustomInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmitCustom();
              }
            }}
            placeholder="Type any city (e.g. Lagos, Paris)…"
            className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-2.5 text-[12px] text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
          />
          <Button
            type="button"
            size="icon-sm"
            onClick={onSubmitCustom}
            disabled={!customInput.trim()}
            className="h-8 w-8 shrink-0 rounded-lg shadow-none disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
          </Button>
        </div>
      </div>
    </div>
  );
}
