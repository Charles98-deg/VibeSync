"use client";

/**
 * Shared 3D primitives for the VibeSync surface:
 *
 * - `AuroraBackground` — cursor-reactive canvas aurora (GPU-composited 2D
 *   gradients, rAF-driven, pauses off-screen, static under reduced motion).
 * - `TiltCard3D` — spring-physics 3D perspective tilt with cursor-tracked
 *   specular glare, glowing border stroke, and a depth shadow that shifts
 *   opposite the tilt angle.
 * - `Levitate` — continuous Y-axis levitation + inverse cursor parallax,
 *   grounded by translateZ elevation inside a perspective context.
 * - `GlowFrame` — mouse/focus-tracking glowing border stroke.
 *
 * All pointer tracking runs through MotionValues / CSS custom properties, so
 * React never re-renders on mousemove. Every effect no-ops for touch or
 * `hover: none` devices and honors `prefers-reduced-motion`.
 */

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionStyle,
} from "framer-motion";
import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Ambient pointer — one shared window listener writing CSS custom properties
// ---------------------------------------------------------------------------

const ambientPointer = { x: 0.5, y: 0.5 };
let ambientPointerListening = false;

function ensureAmbientPointer() {
  if (typeof window === "undefined" || ambientPointerListening) return;
  ambientPointerListening = true;

  let frame = 0;
  const flush = () => {
    frame = 0;
    document.documentElement.style.setProperty("--mx", ambientPointer.x.toFixed(4));
    document.documentElement.style.setProperty("--my", ambientPointer.y.toFixed(4));
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      ambientPointer.x = event.clientX / Math.max(window.innerWidth, 1);
      ambientPointer.y = event.clientY / Math.max(window.innerHeight, 1);
      if (!frame) frame = requestAnimationFrame(flush);
    },
    { passive: true },
  );
}

/** Hoist effect-only ambient pointer wiring (no re-render, no listener leaks). */
export function useAmbientPointer() {
  useEffect(() => {
    ensureAmbientPointer();
  }, []);
}

/**
 * True only when a fine pointer + reasonably large viewport are available, so
 * tilt/glow never fight touch scrolling or small screens.
 */
function usePointerFine() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const hoverNone = window.matchMedia("(hover: none)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const small = window.matchMedia("(max-width: 767px)");
    const update = () =>
      setFine(!hoverNone.matches && !coarse.matches && !small.matches);
    update();
    const queries = [hoverNone, coarse, small];
    for (const query of queries) query.addEventListener("change", update);
    return () => {
      for (const query of queries) query.removeEventListener("change", update);
    };
  }, []);
  return fine;
}

// ---------------------------------------------------------------------------
// AuroraBackground
// ---------------------------------------------------------------------------

type AuroraBlob = {
  color: readonly [number, number, number];
  base: readonly [number, number];
  radius: number;
  amplitude: readonly [number, number];
  speed: number;
  phase: number;
};

const AURORA_BLOBS: AuroraBlob[] = [
  { color: [16, 185, 129], base: [0.2, 0.3], radius: 0.55, amplitude: [0.07, 0.06], speed: 0.00012, phase: 0 },
  { color: [45, 212, 191], base: [0.8, 0.18], radius: 0.5, amplitude: [0.05, 0.07], speed: 0.00016, phase: 2.1 },
  { color: [34, 211, 238], base: [0.6, 0.85], radius: 0.52, amplitude: [0.06, 0.05], speed: 0.0001, phase: 4.2 },
];

function paintAurora(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  cursorX: number,
  cursorY: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  for (const blob of AURORA_BLOBS) {
    const cx = width * (blob.base[0] + Math.sin(time * blob.speed + blob.phase) * blob.amplitude[0]);
    const cy = height * (blob.base[1] + Math.cos(time * blob.speed * 1.3 + blob.phase) * blob.amplitude[1]);
    const r = Math.max(width, height) * blob.radius;
    const [cr, cg, cb] = blob.color;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, `rgba(${cr},${cg},${cb},0.09)`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Cursor-reactive spotlight bloom.
  const bloomRadius = Math.max(width, height) * 0.3;
  const bloomX = cursorX * width;
  const bloomY = cursorY * height;
  const bloom = ctx.createRadialGradient(bloomX, bloomY, 0, bloomX, bloomY, bloomRadius);
  bloom.addColorStop(0, "rgba(52,211,153,0.07)");
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(bloomX - bloomRadius, bloomY - bloomRadius, bloomRadius * 2, bloomRadius * 2);

  ctx.globalCompositeOperation = "source-over";
}

export function AuroraBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ensureAmbientPointer();

    let frame = 0;
    let visible = true;
    let width = 1;
    let height = 1;
    const smooth = { x: ambientPointer.x, y: ambientPointer.y };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const paint = (time: number) => {
      smooth.x += (ambientPointer.x - smooth.x) * 0.05;
      smooth.y += (ambientPointer.y - smooth.y) * 0.05;
      paintAurora(ctx, width, height, time, smooth.x, smooth.y);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) paint(0); // static frame
    };

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      paint(time);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    intersectionObserver.observe(canvas);

    if (reduceMotion) {
      paint(0);
    } else {
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none h-full w-full", className)}
    />
  );
}

// ---------------------------------------------------------------------------
// TiltCard3D
// ---------------------------------------------------------------------------

/** 1px gradient ring mask (excluded composite), shared by border-glow overlays. */
const ringMaskStyle = {
  padding: "1px",
  WebkitMaskImage: "linear-gradient(#fff 0 0), linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "xor",
  maskImage: "linear-gradient(#fff 0 0), linear-gradient(#fff 0 0)",
  maskComposite: "exclude",
} as const;

const SPRING_TILT = { stiffness: 160, damping: 18, mass: 0.7 } as const;
const SPRING_FADE = { stiffness: 140, damping: 22 } as const;

export function TiltCard3D({
  children,
  className,
  surfaceClassName,
  maxTilt = 8,
  glare = true,
  borderGlow = true,
  depthGlow = true,
}: {
  children: ReactNode;
  className?: string;
  /** Applied to the tilting surface — set the border radius here so overlays inherit it. */
  surfaceClassName?: string;
  maxTilt?: number;
  glare?: boolean;
  borderGlow?: boolean;
  depthGlow?: boolean;
}) {
  const fine = usePointerFine();
  const reduceMotion = useReducedMotion();
  const enabled = fine && !reduceMotion;
  const surfaceRef = useRef<HTMLDivElement>(null);

  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const rawGlareX = useMotionValue(50);
  const rawGlareY = useMotionValue(50);
  const rawHover = useMotionValue(0);

  const rotateX = useSpring(rawRotateX, SPRING_TILT);
  const rotateY = useSpring(rawRotateY, SPRING_TILT);
  const hoverOpacity = useSpring(rawHover, SPRING_FADE);

  const glareBackground = useMotionTemplate`radial-gradient(420px circle at ${rawGlareX}% ${rawGlareY}%, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 45%, transparent 72%)`;
  const borderBackground = useMotionTemplate`radial-gradient(300px circle at ${rawGlareX}% ${rawGlareY}%, rgba(52,211,153,0.8), rgba(45,212,191,0.28) 45%, transparent 78%)`;

  // Depth shadow shifts opposite the tilt to ground the card in space.
  const glowX = useTransform(rotateY, (value) => value * -2.4);
  const glowY = useTransform(rotateX, (value) => value * 1.8);

  const handleMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const py = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    rawGlareX.set(px * 100);
    rawGlareY.set(py * 100);
    rawRotateX.set((0.5 - py) * 2 * maxTilt);
    rawRotateY.set((px - 0.5) * 2 * maxTilt);
  };

  const resetTilt = () => {
    rawHover.set(0);
    rawRotateX.set(0);
    rawRotateY.set(0);
  };

  if (!enabled) {
    return <div className={cn("relative", className)}>{children}</div>;
  }

  const surfaceStyle: MotionStyle = {
    rotateX,
    rotateY,
    transformStyle: "preserve-3d",
  };

  return (
    <div className={cn("relative", className)} style={{ perspective: 1200 }}>
      {depthGlow && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-5 -z-10 rounded-3xl bg-emerald-500/[0.08] blur-2xl"
          style={{ x: glowX, y: glowY }}
        />
      )}
      <motion.div
        ref={surfaceRef}
        className={cn("relative [transform-style:preserve-3d]", surfaceClassName)}
        style={surfaceStyle}
        onMouseMove={handleMove}
        onMouseEnter={() => rawHover.set(1)}
        onMouseLeave={resetTilt}
      >
        {children}
        {borderGlow && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              ...ringMaskStyle,
              backgroundImage: borderBackground,
              opacity: hoverOpacity,
            }}
          />
        )}
        {glare && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              backgroundImage: glareBackground,
              opacity: hoverOpacity,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Levitate
// ---------------------------------------------------------------------------

/**
 * Continuous levitation + inverse cursor parallax. The wrapper handles
 * entrance animations (e.g. `fade-in`), the middle layer the CSS-variable
 * parallax, and the inner motion layer the Z elevation + float loop.
 */
export function Levitate({
  children,
  className,
  depth = 30,
  floatPx = 5,
  duration = 7,
  parallax = 0.6,
}: {
  children: ReactNode;
  className?: string;
  /** translateZ elevation in px (floating above the card plane). */
  depth?: number;
  /** Peak vertical float in px. */
  floatPx?: number;
  duration?: number;
  /** Cursor parallax strength factor (0 disables). */
  parallax?: number;
}) {
  const fine = usePointerFine();
  const reduceMotion = useReducedMotion();
  const active = fine && !reduceMotion && parallax !== 0;

  return (
    <div className={className}>
      <div
        className="[transform-style:preserve-3d]"
        style={
          active
            ? {
                transform: `translate3d(calc((var(--mx, 0.5) - 0.5) * ${(-parallax * 34).toFixed(1)}px), calc((var(--my, 0.5) - 0.5) * ${(-parallax * 24).toFixed(1)}px), 0)`,
                transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
              }
            : undefined
        }
      >
        <div
          className="[transform-style:preserve-3d]"
          style={{ perspective: 900 }}
        >
          <motion.div
            style={{ translateZ: depth }}
            animate={!reduceMotion ? { y: [0, -floatPx, 0] } : undefined}
            transition={
              !reduceMotion
                ? { duration, ease: "easeInOut", repeat: Infinity, times: [0, 0.5, 1] }
                : undefined
            }
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlowFrame
// ---------------------------------------------------------------------------

/**
 * Mouse/focus-tracking glowing border stroke. Wraps content without touching
 * its layout; the ring is 1px and inherits the wrapper's border radius.
 */
export function GlowFrame({
  children,
  className,
  radius = 220,
  color = "rgba(16,185,129,0.5)",
  overlayClassName,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Spot radius of the glow in px. */
  radius?: number;
  color?: string;
  overlayClassName?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const fine = usePointerFine();
  const reduceMotion = useReducedMotion();
  const enabled = fine && !reduceMotion;
  const ref = useRef<HTMLDivElement>(null);

  const rawX = useMotionValue(50);
  const rawY = useMotionValue(50);
  const rawHover = useMotionValue(0);
  const opacity = useSpring(rawHover, { stiffness: 160, damping: 24 });
  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${rawX}% ${rawY}%, ${color}, transparent 72%)`;

  const track = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    rawX.set(((event.clientX - rect.left) / rect.width) * 100);
    rawY.set(((event.clientY - rect.top) / rect.height) * 100);
  };

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      {...(enabled
        ? {
            onMouseMove: track,
            onMouseEnter: () => rawHover.set(1),
            onMouseLeave: () => rawHover.set(0),
            onFocusCapture: () => rawHover.set(1),
            onBlurCapture: () => rawHover.set(0),
          }
        : {})}
      {...rest}
    >
      {children}
      {enabled && (
        <motion.div
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", overlayClassName)}
          style={{
            ...ringMaskStyle,
            backgroundImage: background,
            opacity,
          }}
        />
      )}
    </div>
  );
}
