import { useEffect, useRef } from "react";

type Props = {
  playing: boolean;
  className?: string;
};

/** Full turns per second once she has wound up to speed. */
const CRUISE_SPEED = 360 / 5;
/** How quickly she reaches cruise speed after play (per second). */
const WIND_UP = 1.4;
/** Friction after pause: speed decays by e^(-FRICTION·t). */
const FRICTION = 0.8;
/** Below this speed (deg/s) she comes to rest. */
const REST_SPEED = 2;

/**
 * Music-box ballerina for focus mode. She winds up while the score plays and,
 * when paused, keeps turning on momentum and slows gently to a stop.
 */
export function MusicBoxBallerina({ playing, className }: Props) {
  const figureRef = useRef<HTMLDivElement | null>(null);
  const playingRef = useRef(playing);
  const angleRef = useRef(0);
  const speedRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    playingRef.current = playing;
    if (frameRef.current !== null) return;
    if (!playing) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (playingRef.current) {
        speedRef.current += (CRUISE_SPEED - speedRef.current) * Math.min(1, dt * WIND_UP);
      } else {
        speedRef.current *= Math.exp(-FRICTION * dt);
      }

      angleRef.current = (angleRef.current + speedRef.current * dt) % 360;
      if (figureRef.current) {
        figureRef.current.style.transform = `rotateY(${angleRef.current}deg)`;
      }

      if (!playingRef.current && speedRef.current < REST_SPEED) {
        speedRef.current = 0;
        frameRef.current = null;
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [playing]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return (
    <div className={className} aria-hidden="true">
      <div className="relative mx-auto w-32" style={{ perspective: "600px" }}>
        <div ref={figureRef} className="relative z-10 mx-auto w-24" style={{ transformStyle: "preserve-3d" }}>
          <Ballerina />
        </div>
        <MusicBoxBase />
      </div>
    </div>
  );
}

function Ballerina() {
  const skin = "oklch(0.9 0.035 60)";
  const hair = "oklch(0.3 0.03 50)";
  const blush = "oklch(0.82 0.07 15)";
  const tulle = "oklch(0.93 0.04 15)";

  return (
    <svg viewBox="0 0 120 172" className="block w-full overflow-visible">
      {/* arms raised in fifth position */}
      <path d="M53 52 C38 42 40 16 58 11" fill="none" stroke={skin} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M67 52 C82 42 80 16 62 11" fill="none" stroke={skin} strokeWidth="3.4" strokeLinecap="round" />

      {/* head, bun */}
      <circle cx="60" cy="24" r="5.5" fill={hair} />
      <circle cx="60" cy="35" r="8.5" fill={skin} />
      <path d="M51.6 34 Q52 25.5 60 25.5 Q68 25.5 68.4 34 Q64 29.5 60 29.5 Q56 29.5 51.6 34 Z" fill={hair} />
      <rect x="57.6" y="42" width="4.8" height="7" fill={skin} />

      {/* working leg in passé, drawn behind the tutu */}
      <path d="M63 86 L79 110 L61.5 123" fill="none" stroke={tulle} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* supporting leg en pointe */}
      <path d="M58.5 86 L59.4 130 L60 163" fill="none" stroke={tulle} strokeWidth="4.6" strokeLinecap="round" />
      <path d="M58.2 150 L60.8 150 L61 166 L59 166 Z" fill={blush} />

      {/* bodice */}
      <path d="M51 50 Q60 46.5 69 50 L66 75 Q60 77.5 54 75 Z" fill={blush} />

      {/* tutu: two layers of tulle, scalloped hem */}
      <path
        d="M20 82 Q60 64 100 82 Q92 86 86 84 Q80 90 72 86 Q66 92 60 87 Q54 92 48 86 Q40 90 34 84 Q28 86 20 82 Z"
        fill={tulle}
        opacity="0.9"
      />
      <path d="M28 79 Q60 66 92 79 Q60 88 28 79 Z" fill={blush} opacity="0.75" />
      <ellipse cx="60" cy="76" rx="7" ry="2" fill={tulle} />
    </svg>
  );
}

function MusicBoxBase() {
  return (
    <svg viewBox="0 0 128 40" className="-mt-4 block w-full">
      <defs>
        <linearGradient id="mbb-brass" x1="0" x2="1">
          <stop offset="0" stopColor="oklch(0.55 0.09 70)" />
          <stop offset="0.45" stopColor="oklch(0.84 0.12 82)" />
          <stop offset="1" stopColor="oklch(0.5 0.08 68)" />
        </linearGradient>
        <radialGradient id="mbb-mirror" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="oklch(0.95 0.02 85)" />
          <stop offset="1" stopColor="oklch(0.7 0.04 80)" />
        </radialGradient>
      </defs>
      <path d="M8 12 L8 28 A56 10 0 0 0 120 28 L120 12 Z" fill="url(#mbb-brass)" />
      <ellipse cx="64" cy="12" rx="56" ry="10" fill="oklch(0.86 0.11 82)" />
      <ellipse cx="64" cy="11.5" rx="40" ry="6.5" fill="url(#mbb-mirror)" />
      <ellipse cx="64" cy="10" rx="8" ry="1.8" fill="oklch(0 0 0 / 0.25)" />
      <path d="M8 20 A56 10 0 0 0 120 20" fill="none" stroke="oklch(0.45 0.07 65)" strokeWidth="0.8" />
    </svg>
  );
}
