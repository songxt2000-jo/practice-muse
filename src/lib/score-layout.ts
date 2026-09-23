/**
 * Finds staves, barlines, repeat signs and volta brackets on a page image of
 * printed piano music. Pure image processing — no AI, nothing leaves the browser.
 *
 * Teaching editions print the teacher duet on smaller staves; those are tagged
 * `teacher` by comparing staff-line spacing against the piece's largest spacing.
 * All coordinates in the result are fractions of the page width / height, so a
 * layout detected at one resolution can be drawn over the page at any size.
 */

export type RawImage = { data: Uint8ClampedArray; width: number; height: number };

export type LayoutBar = {
  /** Left and right edge of the (possibly thick / double) barline. */
  x: number;
  xEnd: number;
  thick: boolean;
  repeatStart: boolean;
  repeatEnd: boolean;
};

export type LayoutVolta = { from: number; to: number; number: number };

export type LayoutSystem = {
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  /** Staff-line spacing as a fraction of page height. */
  space: number;
  staves: number;
  teacher: boolean;
  bars: LayoutBar[];
  voltas: LayoutVolta[];
};

export type PageLayout = {
  page: number;
  /** Page height / width, to turn staff spacing into horizontal distance. */
  aspect: number;
  systems: LayoutSystem[];
};

type Staff = { top: number; bottom: number; space: number };
type PxBar = { x: number; xEnd: number; width: number; repeatStart: boolean; repeatEnd: boolean };
type PxSystem = {
  staves: Staff[];
  space: number;
  x0: number;
  x1: number;
  bars: PxBar[];
  voltas: Array<{ from: number; to: number }>;
};

type Detected = { page: number; width: number; height: number; systems: PxSystem[] };

/** Dark pixels, ignoring red pen marks that were drawn into the image. */
function toInk({ data, width, height }: RawImage): Uint8Array {
  const ink = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < ink.length; i += 4, p += 1) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const reddish = r - Math.max(g, b) > 60;
    ink[p] = lum < 140 && !reddish ? 1 : 0;
  }
  return ink;
}

function findStaves(ink: Uint8Array, w: number, h: number): Staff[] {
  const lines: number[][] = [];
  for (let y = 0; y < h; y += 1) {
    let sum = 0;
    const row = y * w;
    for (let x = 0; x < w; x += 1) sum += ink[row + x]!;
    if (sum / w <= 0.35) continue;
    const last = lines[lines.length - 1];
    if (last && y - last[last.length - 1]! <= 1) last.push(y);
    else lines.push([y]);
  }
  const centers = lines.map((l) => l.reduce((a, b) => a + b, 0) / l.length);

  const staves: Staff[] = [];
  let i = 0;
  while (i + 4 < centers.length) {
    const group = centers.slice(i, i + 5);
    const gaps = group.slice(1).map((y, k) => y - group[k]!);
    const mean = gaps.reduce((a, b) => a + b, 0) / 4;
    if (Math.max(...gaps) - Math.min(...gaps) <= 2.5 && mean > 4) {
      staves.push({ top: group[0]!, bottom: group[4]!, space: mean });
      i += 5;
    } else {
      i += 1;
    }
  }
  return staves;
}

/** Columns where all five lines carry ink: the horizontal extent of the staff. */
function staffExtent(ink: Uint8Array, w: number, h: number, st: Staff): [number, number] {
  let min = -1, max = -1;
  const ys = [0, 1, 2, 3, 4].map((k) => Math.round(st.top + (k * (st.bottom - st.top)) / 4));
  for (let x = 0; x < w; x += 1) {
    let all = true;
    for (const y of ys) {
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy += 1) {
        const yy = y + dy;
        if (yy >= 0 && yy < h && ink[yy * w + x]) hit = true;
      }
      if (!hit) { all = false; break; }
    }
    if (all) {
      if (min < 0) min = x;
      max = x;
    }
  }
  return [min, max];
}

function groupSystems(staves: Staff[]): PxSystem[] {
  const out: PxSystem[] = [];
  let i = 0;
  while (i < staves.length) {
    const a = staves[i]!;
    const b = staves[i + 1];
    if (b && Math.abs(a.space - b.space) < 1.2 && b.top - a.bottom < a.space * 9) {
      out.push({ staves: [a, b], space: (a.space + b.space) / 2, x0: 0, x1: 0, bars: [], voltas: [] });
      i += 2;
    } else {
      out.push({ staves: [a], space: a.space, x0: 0, x1: 0, bars: [], voltas: [] });
      i += 1;
    }
  }
  return out;
}

function findBarlines(ink: Uint8Array, w: number, s: PxSystem): PxBar[] {
  const top = Math.round(s.staves[0]!.top);
  const bot = Math.round(s.staves[s.staves.length - 1]!.bottom);
  const height = bot - top + 1;
  const xs: number[] = [];
  for (let x = Math.max(0, s.x0 - 3); x <= Math.min(w - 1, s.x1 + 3); x += 1) {
    let sum = 0;
    for (let y = top; y <= bot; y += 1) sum += ink[y * w + x]!;
    if (sum / height > 0.9) xs.push(x);
  }
  const groups: number[][] = [];
  for (const x of xs) {
    const last = groups[groups.length - 1];
    if (last && x - last[last.length - 1]! <= s.space * 1.2) last.push(x);
    else groups.push([x]);
  }
  return groups.map((g) => ({
    x: g[0]!,
    xEnd: g[g.length - 1]!,
    width: g[g.length - 1]! - g[0]! + 1,
    repeatStart: false,
    repeatEnd: false,
  }));
}

/**
 * Repeat dots sit in the 2nd and 3rd spaces of every staff, with the 1st and 4th
 * spaces empty — which rules out a brace or clef that fills the whole height.
 */
function hasDots(ink: Uint8Array, w: number, st: Staff, xFrom: number, xTo: number): boolean {
  const sp = st.space;
  const half = Math.floor(sp * 0.3);
  const inkAround = (k: number) => {
    const y = Math.round(st.top + k * sp);
    let sum = 0, n = 0;
    for (let yy = y - half; yy <= y + half; yy += 1) {
      for (let x = Math.max(0, xFrom); x < Math.min(w, xTo); x += 1) {
        sum += ink[yy * w + x]!;
        n += 1;
      }
    }
    return { sum, n };
  };
  for (const k of [1.5, 2.5]) {
    const { sum, n } = inkAround(k);
    if (!n || sum < sp * sp * 0.05 || sum / n >= 0.6) return false;
  }
  for (const k of [0.5, 3.5]) {
    if (inkAround(k).sum >= sp * sp * 0.04) return false;
  }
  return true;
}

function classifyBars(ink: Uint8Array, w: number, s: PxSystem) {
  const sp = s.space;
  s.bars.forEach((b, i) => {
    // the line that opens a system can start a repeat but never end one
    b.repeatEnd = i > 0 && s.staves.every((st) => hasDots(ink, w, st, b.x - Math.round(sp * 1.4), b.x - 2));
    b.repeatStart = s.staves.every((st) => hasDots(ink, w, st, b.xEnd + 3, b.xEnd + Math.round(sp * 1.4)));
  });
}

/**
 * Volta brackets: one straight unbroken line above the top staff with downward
 * hooks. 1st and 2nd endings are often joined; every hook starts a new ending.
 */
function findVoltas(ink: Uint8Array, w: number, s: PxSystem): Array<{ from: number; to: number }> {
  const sp = s.space;
  const top = Math.floor(s.staves[0]!.top);
  const barXs = [s.x0, ...s.bars.map((b) => b.xEnd)];
  const firstBar = s.bars.length > 1 ? s.bars[1]!.x : s.x1;

  for (let y = Math.floor(top - sp * 6); y < Math.floor(top - sp * 0.8); y += 1) {
    if (y < 0) continue;
    const xs: number[] = [];
    for (let x = s.x0; x <= s.x1; x += 1) if (ink[y * w + x]) xs.push(x);
    if (xs.length < sp * 8) continue;
    const first = xs[0]!, last = xs[xs.length - 1]!;
    if (last - first < sp * 5 || xs.length / (last - first + 1) < 0.95) continue;

    const hooks: number[] = [];
    const reach = Math.floor(sp * 1.2);
    for (const x of xs) {
      let sum = 0;
      for (let yy = y + 2; yy < y + reach; yy += 1) sum += ink[yy * w + x]!;
      if (sum / Math.max(1, reach - 2) <= 0.8) continue;
      if (hooks.length && x - hooks[hooks.length - 1]! <= 4) hooks[hooks.length - 1] = x;
      else hooks.push(x);
    }
    const onBar = hooks.every(
      (hx) => Math.min(...barXs.map((bx) => Math.abs(hx - bx))) < sp * 1.5 || hx < firstBar,
    );
    if (hooks.length && hooks[0]! - first < sp && onBar) {
      const ends = [...hooks.slice(1), last];
      return hooks
        .map((from, i) => ({ from, to: ends[i]! }))
        .filter((v) => v.to - v.from > sp * 3);
    }
  }
  return [];
}

/** Detect everything on one page except the teacher/student split. */
export function detectPage(page: number, image: RawImage): Detected {
  const { width: w, height: h } = image;
  const ink = toInk(image);
  const systems = groupSystems(findStaves(ink, w, h));
  for (const s of systems) {
    const exts = s.staves.map((st) => staffExtent(ink, w, h, st));
    s.x0 = Math.max(...exts.map((e) => e[0]));
    s.x1 = Math.min(...exts.map((e) => e[1]));
    s.bars = findBarlines(ink, w, s);
    classifyBars(ink, w, s);
    s.voltas = findVoltas(ink, w, s);
  }
  return { page, width: w, height: h, systems };
}

/**
 * Turn detected pages into a normalized layout. Staves noticeably smaller than
 * the piece's largest staff are the teacher duet.
 */
export function finishLayout(pages: Detected[]): PageLayout[] {
  const spaces = pages.flatMap((p) => p.systems.map((s) => s.space));
  const ref = spaces.length ? Math.max(...spaces) : 0;
  return pages.map((p) => ({
    page: p.page,
    aspect: p.height / p.width,
    systems: p.systems.map((s) => ({
      top: s.staves[0]!.top / p.height,
      bottom: s.staves[s.staves.length - 1]!.bottom / p.height,
      x0: s.x0 / p.width,
      x1: s.x1 / p.width,
      space: s.space / p.height,
      staves: s.staves.length,
      teacher: s.space < ref * 0.9,
      bars: s.bars.map((b) => ({
        x: b.x / p.width,
        xEnd: b.xEnd / p.width,
        thick: b.width >= 4,
        repeatStart: b.repeatStart,
        repeatEnd: b.repeatEnd,
      })),
      voltas: s.voltas.map((v, i) => ({ from: v.from / p.width, to: v.to / p.width, number: i + 1 })),
    })),
  }));
}
