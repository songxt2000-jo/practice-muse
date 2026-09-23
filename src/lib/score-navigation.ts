import type { PageLayout } from "@/lib/score-layout";

/** One printed measure, in reading order. Coordinates are page fractions. */
export type Measure = {
  index: number;
  page: number;
  system: number;
  /** Where the cursor starts and ends inside this measure. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  firstInSystem: boolean;
  repeatStart: boolean;
  repeatEnd: boolean;
  volta: number | null;
};

/** A measure as it is played: repeats unrolled, endings chosen. */
export type Step = { measure: number; beats: number; startBeat: number };

/** Clef + key + time signature at the start of a line take roughly this many staff spaces. */
const SYSTEM_HEAD_SPACES = 5;

/** Every measure of the student part, in the order it is printed. */
export function listMeasures(layout: PageLayout[]): Measure[] {
  const out: Measure[] = [];
  for (const page of layout) {
    page.systems.forEach((sys, s) => {
      if (sys.teacher) return;
      for (let i = 0; i + 1 < sys.bars.length; i += 1) {
        const start = sys.bars[i]!;
        const end = sys.bars[i + 1]!;
        let left = start.xEnd;
        if (i === 0) {
          const head = sys.space * page.aspect * SYSTEM_HEAD_SPACES;
          left = Math.min(left + head, left + (end.x - left) * 0.4);
        }
        const center = (start.xEnd + end.x) / 2;
        const volta = sys.voltas.find((v) => v.from <= center && center <= v.to);
        out.push({
          index: out.length,
          page: page.page,
          system: s,
          left,
          right: end.x,
          top: sys.top,
          bottom: sys.bottom,
          firstInSystem: i === 0,
          repeatStart: start.repeatStart,
          repeatEnd: end.repeatEnd,
          volta: volta?.number ?? null,
        });
      }
    });
  }
  return out;
}

/**
 * Unroll repeats and endings into the order the measures are played.
 * On the way back through a repeat, measures under a 1st ending are skipped
 * and the matching 2nd ending is taken.
 */
export function playOrder(measures: Measure[], beatsPerMeasure: number, pickupBeats = 0): Step[] {
  const steps: Step[] = [];
  const taken = new Set<number>();
  let sectionStart = 0;
  let pass = 1;
  let leavingEnding = false;
  let beat = 0;
  let i = 0;
  let guard = 0;

  while (i < measures.length && guard < measures.length * 4) {
    guard += 1;
    const m = measures[i]!;
    if (m.repeatStart && pass === 1) sectionStart = i;

    if (m.volta !== null && m.volta !== pass) {
      i += 1;
      continue;
    }
    if (m.volta === null && leavingEnding) {
      pass = 1;
      leavingEnding = false;
      sectionStart = i;
    }

    const beats = i === 0 && pickupBeats > 0 && steps.length === 0 ? pickupBeats : beatsPerMeasure;
    steps.push({ measure: i, beats, startBeat: beat });
    beat += beats;

    if (m.volta !== null && pass > 1) leavingEnding = true;

    if (m.repeatEnd && !taken.has(i)) {
      taken.add(i);
      pass = 2;
      i = sectionStart;
      continue;
    }
    if (m.repeatEnd) {
      // a later repeat without a start sign goes back to here
      pass = 1;
      sectionStart = i + 1;
    }
    i += 1;
  }
  return steps;
}

/**
 * A short first measure is a pickup. Guess its beats from how much narrower it
 * is than a typical opening measure; the player can correct it.
 */
export function guessPickupBeats(measures: Measure[], beatsPerMeasure: number): number {
  const openers = measures.filter((m) => m.firstInSystem).slice(1);
  const first = measures[0];
  if (!first || openers.length === 0) return 0;
  const widths = openers.map((m) => m.right - m.left).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)]!;
  const ratio = (first.right - first.left) / typical;
  if (ratio > 0.6) return 0;
  return Math.max(1, Math.min(beatsPerMeasure - 1, Math.round(ratio * beatsPerMeasure)));
}

/** Where the cursor is at a given beat: the step, its measure, and progress through it. */
export function locate(steps: Step[], beat: number): { step: number; progress: number } | null {
  if (!steps.length) return null;
  let lo = 0, hi = steps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (steps[mid]!.startBeat <= beat) lo = mid;
    else hi = mid - 1;
  }
  const s = steps[lo]!;
  if (beat >= s.startBeat + s.beats) return null;
  return { step: lo, progress: Math.max(0, (beat - s.startBeat) / s.beats) };
}
