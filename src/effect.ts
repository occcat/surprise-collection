/**
 * The bookmark effect as plain numbers and path strings: where the liquid's edge is, how the icon
 * wobbles and where the sparks are at each moment. No DOM here, so node --test covers it; render.ts
 * puts the paths on screen.
 *
 * Every curve below was measured frame by frame (60 fps) from @itsluneri's video,
 * https://x.com/itsluneri/status/2116674589719675144, at its normal-speed takes: the bookmark at
 * 0.76 s and the removal at 2.67 s. Times are ms from the first frame the icon moves.
 *
 * Coordinates are in the 24 × 24 viewBox of X's bookmark icon, y pointing down.
 */

export type EffectKind = "add" | "remove";
export type Point = readonly [number, number];

/** How long each effect runs, in ms. */
export const DURATION: Readonly<Record<EffectKind, number>> = { add: 820, remove: 540 };

/** The box the effect is drawn in. It is larger than the icon: the icon stretches and bulges, and the sparks fly out below. */
export const VIEWBOX = { x: -3, y: -3, w: 30, h: 32 } as const;

// X's icon: the outer edge spans x 4–20 and y 2–22.94, with the notch rising to y 17.23 at x 12.
// The not-yet-bookmarked icon also has a hole: x 6–18, y 4–19.06, notch at 14.77.
export const CX = 12;
const TOP = 2;
const BOTTOM = 22.94;
const NOTCH = 17.23;
const HOLE_TOP = 4;
const HOLE_BOTTOM = 19.06;

/**
 * The liquid's edge is a halftone, laid out on columns `pitch` apart and measured from the edge of
 * the solid liquid: a row of tabs hanging from it with thin slits between them, then a row of large
 * dots in the slits' columns, then a row of small dots in the tabs' columns.
 */
const HALFTONE = {
  pitch: 1.81,
  tab: { halfWidth: 0.795, length: 1.57, round: 0.6 },
  big: { dy: 2.38, r: 0.65 },
  small: { dy: 4.14, r: 0.38 },
} as const;
const DEPTH = HALFTONE.small.dy + HALFTONE.small.r;
/** At this edge position no part of the liquid has reached the hole yet. */
export const EMPTY_FRONT = HOLE_TOP - DEPTH;
/** At this edge position the hole is full: past its bottom corners, and past the clip's margin. */
export const FULL_FRONT = HOLE_BOTTOM + 0.3;

// --- Outlines ---------------------------------------------------------------------------------

function line(out: Point[], a: Point, b: Point, step: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  for (let i = 0; i < n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
}

/** Points on an ellipse from angle a0 to a1 (radians, growing clockwise on screen), end excluded. */
function arc(out: Point[], cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, step: number): void {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / step));
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
}

/**
 * A bookmark outline, clockwise on screen from the top-left corner: rounded top corners and a
 * notched bottom. Densely sampled, so it still looks smooth once it is bent.
 */
function bookmark(x0: number, x1: number, top: number, r: number, bottom: number, notch: number): Point[] {
  const step = 0.5;
  const out: Point[] = [];
  arc(out, x0 + r, top + r, r, r, Math.PI, 1.5 * Math.PI, step);
  line(out, [x0 + r, top], [x1 - r, top], step);
  arc(out, x1 - r, top + r, r, r, 1.5 * Math.PI, 2 * Math.PI, step);
  line(out, [x1, top + r], [x1, bottom], step);
  line(out, [x1, bottom], [CX, notch], step);
  line(out, [CX, notch], [x0, bottom], step);
  line(out, [x0, bottom], [x0, top + r], step);
  return out;
}

/** Each point pushed `d` outwards along the average of its two edges' normals. */
function grow(poly: readonly Point[], d: number): Point[] {
  return poly.map((p, i) => {
    const a = poly[(i + poly.length - 1) % poly.length] ?? p;
    const b = poly[(i + 1) % poly.length] ?? p;
    // For a clockwise outline with y down, (dy, -dx) points outwards.
    const n1 = unit(p[1] - a[1], a[0] - p[0]);
    const n2 = unit(b[1] - p[1], p[0] - b[0]);
    const n = unit(n1[0] + n2[0], n1[1] + n2[1]);
    return [p[0] + n[0] * d, p[1] + n[1] * d];
  });
}

function unit(x: number, y: number): Point {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** The outer edge of X's icon. */
export const OUTER: readonly Point[] = bookmark(4, 20, TOP, 2.5, BOTTOM, NOTCH);
/** The hole of the not-yet-bookmarked icon. */
export const HOLE: readonly Point[] = bookmark(6, 18, HOLE_TOP, 0.5, HOLE_BOTTOM, 14.77);
/**
 * The liquid is clipped to a slightly larger hole, so it overlaps the outline instead of meeting
 * it edge to edge, which would leave a faint antialiasing seam between two shapes of one colour.
 */
const CLIP: readonly Point[] = grow(HOLE, 0.25);

// --- Jelly ------------------------------------------------------------------------------------

/**
 * How the icon is bent away from its rest shape, like jelly. `squash` lowers the top towards the
 * bottom edge, which never moves (negative: the icon stretches taller), and widens the icon by half
 * as much, so it keeps its volume. On top of that a bulge of height `bump` sits at `at`, a fraction
 * of the icon's height from the top (0) to the bottom (1), and falls off over `above` towards the
 * top and `below` towards the bottom.
 */
export type Shape = { squash: number; bump: number; at: number; above: number; below: number };
export const REST: Shape = { squash: 0, bump: 0, at: 0, above: 0.17, below: 0.17 };

/** The icon's width at rest height y, as a multiple of its width at rest. */
export function widthAt(y: number, s: Shape): number {
  const u = (y - TOP) / (BOTTOM - TOP);
  const d = u - s.at;
  const sigma = d < 0 ? s.above : s.below;
  return 1 + 0.5 * s.squash + s.bump * Math.exp(-(d * d) / (2 * sigma * sigma));
}

export function warp(p: Point, s: Shape): Point {
  return [CX + (p[0] - CX) * widthAt(p[1], s), BOTTOM - (BOTTOM - p[1]) * (1 - s.squash)];
}

// --- Time -------------------------------------------------------------------------------------

/** Rows of [ms, value, value…]. Read with track(). */
type Keys = ReadonlyArray<readonly number[]>;

/**
 * Column `col` of `keys` at time t, on a smooth curve through every key (a cubic Hermite spline,
 * flat at both ends). Before the first key it holds the first value, after the last the last.
 */
export function track(keys: Keys, t: number, col = 1): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return 0;
  if (!(t > (first[0] ?? 0))) return first[col] ?? 0;
  if (t >= (last[0] ?? 0)) return last[col] ?? 0;
  let i = 0;
  while ((keys[i + 1]?.[0] ?? Infinity) <= t) i++;
  const at = (k: number, c: number): number => keys[Math.min(keys.length - 1, Math.max(0, k))]?.[c] ?? 0;
  const slope = (k: number): number => (k <= 0 || k >= keys.length - 1 ? 0 : (at(k + 1, col) - at(k - 1, col)) / (at(k + 1, 0) - at(k - 1, 0)));
  const t0 = at(i, 0);
  const h = at(i + 1, 0) - t0;
  const p = (t - t0) / h;
  const p2 = p * p;
  const p3 = p2 * p;
  return (2 * p3 - 3 * p2 + 1) * at(i, col) + (p3 - 2 * p2 + p) * h * slope(i) + (-2 * p3 + 3 * p2) * at(i + 1, col) + (p3 - p2) * h * slope(i + 1);
}

/**
 * The squash over time. Bookmarking: the icon stretches 6 % taller as it fills with colour, squashes
 * 13 % when the liquid lands, then rebounds and settles. Removing does the same, a little softer.
 */
const SQUASH: Readonly<Record<EffectKind, Keys>> = {
  add: [
    [0, 0], [17, -0.004], [33, -0.024], [50, -0.039], [67, -0.051], [83, -0.059], [100, -0.06], [117, -0.056],
    [133, -0.04], [150, -0.012], [167, 0.03], [183, 0.074], [200, 0.105], [217, 0.123], [233, 0.129], [250, 0.106],
    [267, 0.074], [283, 0.042], [300, 0.012], [317, -0.016], [333, -0.031], [350, -0.04], [367, -0.043], [383, -0.039],
    [400, -0.031], [417, -0.021], [433, -0.012], [450, -0.004], [467, 0.004], [483, 0.01], [500, 0.012], [533, 0.012],
    [550, 0.008], [583, 0.004], [620, 0],
  ],
  remove: [
    [0, 0], [17, -0.008], [33, -0.035], [50, -0.051], [67, -0.059], [83, -0.059], [100, -0.043], [117, -0.012],
    [133, 0.031], [150, 0.067], [167, 0.086], [183, 0.094], [200, 0.078], [217, 0.054], [233, 0.031], [250, 0.008],
    [267, -0.012], [283, -0.024], [300, -0.031], [317, -0.031], [333, -0.028], [350, -0.024], [367, -0.016],
    [383, -0.008], [400, -0.001], [417, 0.004], [433, 0.008], [483, 0.008], [517, 0.004], [540, 0],
  ],
};

/**
 * The bulge: [ms, height, position, fall-off towards the top]. Bookmarking, it swells at the top as
 * the icon squashes and runs down to the bottom, where the sparks fly out. Removing, it starts at the
 * bottom and runs up as the liquid drains.
 */
const BUMP: Readonly<Record<EffectKind, Keys>> = {
  add: [
    [150, 0, 0.05, 0.26], [167, 0.075, 0.05, 0.26], [183, 0.09, 0.06, 0.26], [200, 0.125, 0.09, 0.26],
    [217, 0.128, 0.17, 0.26], [233, 0.14, 0.28, 0.25], [250, 0.14, 0.35, 0.2], [267, 0.138, 0.45, 0.17],
    [283, 0.133, 0.54, 0.17], [300, 0.128, 0.63, 0.17], [317, 0.118, 0.72, 0.17], [333, 0.11, 0.81, 0.17],
    [350, 0.1, 0.9, 0.17], [367, 0.085, 0.97, 0.17], [383, 0.06, 1.02, 0.17], [400, 0.03, 1.06, 0.17],
    [433, 0, 1.12, 0.17],
  ],
  remove: [
    [117, 0, 0.97, 0.16], [133, 0.05, 0.95, 0.16], [150, 0.07, 0.9, 0.16], [167, 0.08, 0.85, 0.16],
    [183, 0.096, 0.8, 0.16], [200, 0.096, 0.71, 0.16], [217, 0.096, 0.64, 0.16], [233, 0.098, 0.55, 0.16],
    [250, 0.1, 0.43, 0.16], [267, 0.1, 0.33, 0.16], [283, 0.085, 0.24, 0.16], [300, 0.08, 0.14, 0.16],
    [317, 0.08, 0.06, 0.16], [333, 0.06, 0.05, 0.16], [350, 0.05, 0.05, 0.16], [367, 0.04, 0.05, 0.16],
    [383, 0.025, 0.05, 0.16], [400, 0, 0.05, 0.16],
  ],
};
const BUMP_BELOW: Readonly<Record<EffectKind, number>> = { add: 0.17, remove: 0.16 };

/** A short stroke with round caps. (x1, y1) is the end nearer the icon. */
export type Spark = { x1: number; y1: number; x2: number; y2: number; width: number; alpha: number };

export type Frame = {
  /** 0 draws everything in the icon's colour from before the click, 1 in its colour after. */
  tint: number;
  /** The edge of the solid liquid, in rest coordinates: everything above it is filled. */
  front: number;
  shape: Shape;
  sparks: Spark[];
  /** Past the end: the icon is at rest and X's own icon can show again. */
  done: boolean;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const progress = (t: number, from: number, to: number): number => clamp01((t - from) / (to - from));
const smooth = (p: number): number => p * p * (3 - 2 * p);
const easeOut = (p: number, k: number): number => 1 - (1 - p) ** k;

/**
 * The edge of the solid liquid. Bookmarking, it pops in at 88 ms with only the small dots showing
 * below the hole's top, then falls with constant acceleration, like a drop, and passes the bottom
 * of the hole at 268 ms. Removing, it rises fast from 197 ms and slows to a stop with the small
 * dots touching the hole's top, where they vanish at 395 ms.
 */
function frontAt(kind: EffectKind, t: number): number {
  const hidden = EMPTY_FRONT - 0.06;
  if (kind === "add") return t < 88 ? hidden : Math.min(FULL_FRONT + 1, 0.381 + 5.41e-4 * (t - 81) ** 2);
  return t >= 395 ? hidden : Math.min(FULL_FRONT + 1, 0.554 + 5.0e-4 * Math.max(0, 391.2 - t) ** 2);
}

/**
 * Where the sparks start and which way they fly: out of the bottom corners at 45°, and straight
 * down from the notch. `start` is how far along that line they appear, `travel` how far the outer
 * end goes.
 */
const S = Math.SQRT1_2;
const SPARKS: ReadonlyArray<{ from: Point; dir: Point; start: number; inner: number; travel: number }> = [
  { from: [3.8, 22.74], dir: [-S, S], start: 0.6, inner: 0.6, travel: 4.75 },
  { from: [CX, NOTCH], dir: [0, 1], start: 4.4, inner: 4.0, travel: 4.32 },
  { from: [20.2, 22.74], dir: [S, S], start: 0.6, inner: 0.6, travel: 4.75 },
];

/**
 * Bookmarking only. Each spark pops out as a dot when the bulge reaches the bottom, its outer end
 * shoots out and slows down, its inner end follows later, so it stretches into a dash and shrinks
 * back to a short one. It thins from 1.95 to 1.35 units on the way, then fades.
 */
function sparksAt(t: number): Spark[] {
  if (t < 375 || t >= 810) return [];
  const out = easeOut(progress(t, 370, 770), 2.8);
  const inn = easeOut(progress(t, 460, 890), 2.5);
  const width = 1.3 + 0.65 * smooth(progress(t, 375, 425)) - 0.6 * progress(t, 440, 760);
  const alpha = 1 - progress(t, 675, 810);
  return SPARKS.map(({ from, dir, start, inner, travel }) => {
    const b = start + travel * out;
    const a = Math.min(b, inner + (start + travel - inner) * inn);
    return { x1: from[0] + dir[0] * a, y1: from[1] + dir[1] * a, x2: from[0] + dir[0] * b, y2: from[1] + dir[1] * b, width, alpha };
  });
}

/**
 * The effect `time` ms after X switched the button.
 *
 * add: the outline turns blue as the icon stretches; liquid falls in from the top, led by its
 * halftone edge; the icon squashes as it lands and a bulge runs down it; three sparks fly out when
 * the bulge reaches the bottom.
 * remove: the icon stretches, then squashes with a bulge running up while the liquid drains back
 * out; the outline and the last of the liquid fade to the idle colour.
 */
export function frameAt(kind: EffectKind, time: number): Frame {
  if (!(time < DURATION[kind])) {
    return { tint: 1, front: kind === "add" ? FULL_FRONT + 1 : EMPTY_FRONT - 0.06, shape: { ...REST }, sparks: [], done: true };
  }
  const t = Math.max(0, time);
  const bump = BUMP[kind];
  return {
    tint: kind === "add" ? smooth(progress(t, 5, 68)) : smooth(progress(t, 285, 415)),
    front: frontAt(kind, t),
    shape: { squash: track(SQUASH[kind], t), bump: track(bump, t, 1), at: track(bump, t, 2), above: track(bump, t, 3), below: BUMP_BELOW[kind] },
    sparks: kind === "add" ? sparksAt(t) : [],
    done: false,
  };
}

// --- Paths ------------------------------------------------------------------------------------

/** SVG path data for one frame. */
export type Geometry = {
  /** The icon's outer edge. Drawn together with `hole` under the even-odd rule, it is the outline. */
  body: string;
  /** Null once the liquid has filled the icon: then `body` alone is the solid icon. */
  hole: string | null;
  /** The liquid, to be clipped to `clip`. Null while none of it shows. */
  liquid: string | null;
  clip: string | null;
};

const round = (n: number): number => Math.round(n * 100) / 100;

function pathOf(polys: ReadonlyArray<readonly Point[]>): string {
  return polys.map((poly) => poly.map((p, i) => `${i ? "L" : "M"}${round(p[0])} ${round(p[1])}`).join("") + "Z").join("");
}

/** A dot. Angles grow clockwise on screen, as in every other shape here, so they all add up under the nonzero fill rule. */
function circle(cx: number, cy: number, r: number): Point[] {
  const out: Point[] = [];
  arc(out, cx, cy, r, r, 0, 2 * Math.PI, 0.25);
  return out;
}

/** A tab hanging from the liquid's edge at y: straight sides and a rounded bottom. Starts a little above y so it joins the block. */
function tab(x: number, y: number): Point[] {
  const { halfWidth: w, length, round: r } = HALFTONE.tab;
  const out: Point[] = [];
  line(out, [x - w, y - 0.2], [x + w, y - 0.2], 0.5);
  line(out, [x + w, y - 0.2], [x + w, y + length - r], 0.5);
  arc(out, x, y + length - r, w, r, 0, Math.PI, 0.25);
  line(out, [x - w, y + length - r], [x - w, y - 0.2], 0.5);
  return out;
}

/** The liquid down to `front`, unbent: a block above it, then the halftone below it. */
function liquidAt(front: number): Point[][] {
  const block: Point[] = [];
  const [x0, x1, top] = [CX - 10, CX + 10, -3];
  line(block, [x0, top], [x1, top], 1);
  line(block, [x1, top], [x1, front], 0.5);
  line(block, [x1, front], [x0, front], 0.5);
  line(block, [x0, front], [x0, top], 0.5);
  const out = [block];
  const { pitch, big, small } = HALFTONE;
  for (let k = -4; k <= 3; k++) out.push(tab(CX + (k + 0.5) * pitch, front));
  for (let k = -3; k <= 3; k++) out.push(circle(CX + k * pitch, front + big.dy, big.r));
  for (let k = -3; k <= 2; k++) out.push(circle(CX + (k + 0.5) * pitch, front + small.dy, small.r));
  return out;
}

export function geometry(f: Frame): Geometry {
  const bend = (poly: readonly Point[]): Point[] => poly.map((p) => warp(p, f.shape));
  const body = pathOf([bend(OUTER)]);
  if (f.front >= FULL_FRONT) return { body, hole: null, liquid: null, clip: null };
  const hole = pathOf([bend(HOLE)]);
  if (f.front <= EMPTY_FRONT) return { body, hole, liquid: null, clip: null };
  return { body, hole, liquid: pathOf(liquidAt(f.front).map(bend)), clip: pathOf([bend(CLIP)]) };
}

// --- Colour -----------------------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

/** "rgb(29, 155, 240)", "rgba(…)" or "#1d9bf0". Anything else is null. */
export function parseRgb(css: string): Rgb | null {
  const s = css.trim();
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** The colour `t` of the way from `a` to `b`. Colours it can't read switch over halfway instead. */
export function mixColor(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  return `rgb(${pa.map((v, i) => Math.round(v + ((pb[i] ?? v) - v) * t)).join(", ")})`;
}
