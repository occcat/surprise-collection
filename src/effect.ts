/**
 * The bookmark effect as plain numbers and path strings: where the liquid's edge is, how the icon
 * bends and where the sparks are at each moment. No DOM here, so node --test covers it; render.ts
 * puts the paths on screen.
 *
 * Coordinates are in the 24 × 24 viewBox of X's bookmark icon, y pointing down.
 */

export type EffectKind = "add" | "remove";
export type Point = readonly [number, number];

/** How long each effect runs, in ms. */
export const DURATION: Readonly<Record<EffectKind, number>> = { add: 900, remove: 600 };

/** The box the effect is drawn in. It is larger than the icon: the top bulges and the sparks fly out below. */
export const VIEWBOX = { x: -3, y: -3, w: 30, h: 32 } as const;

// X's icon: the outer edge spans x 4–20 and y 2–22.94, with the notch rising to y 17.23 at x 12.
// The not-yet-bookmarked icon also has a hole: x 6–18, y 4–19.06, notch at 14.77.
export const CX = 12;
const TOP = 2;
const BOTTOM = 22.94;
const HOLE_TOP = 4;
const HOLE_BOTTOM = 19.06;

/** Bumps along the liquid's edge. They overlap, which leaves small points between them. */
const EDGE = { r: 0.95, gap: 1.75 } as const;
/** Rows of droplets running ahead of the edge: distance below it, radius, sideways shift in gaps. */
const DROPS: ReadonlyArray<{ dy: number; r: number; shift: number }> = [
  { dy: 1.75, r: 0.55, shift: 0.5 },
  { dy: 3, r: 0.36, shift: 0 },
  { dy: 4.05, r: 0.2, shift: 0.5 },
];
/** At this edge position no droplet has reached the hole yet. */
export const EMPTY_FRONT = HOLE_TOP - 4.6;
/** At this edge position the hole is full. */
export const FULL_FRONT = HOLE_BOTTOM + 1.2;

// --- Outlines ---------------------------------------------------------------------------------

function line(out: Point[], a: Point, b: Point, step: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  for (let i = 0; i < n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
}

function arc(out: Point[], cx: number, cy: number, r: number, a0: number, a1: number, step: number): void {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / step));
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
}

/**
 * A bookmark outline, clockwise on screen from the top-left corner: rounded top corners and a
 * notched bottom. Densely sampled, so it still looks smooth once it is bent.
 */
function bookmark(x0: number, x1: number, top: number, r: number, bottom: number, notch: number): Point[] {
  const step = 0.5;
  const out: Point[] = [];
  arc(out, x0 + r, top + r, r, Math.PI, 1.5 * Math.PI, step);
  line(out, [x0 + r, top], [x1 - r, top], step);
  arc(out, x1 - r, top + r, r, 1.5 * Math.PI, 2 * Math.PI, step);
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
export const OUTER: readonly Point[] = bookmark(4, 20, TOP, 2.5, BOTTOM, 17.23);
/** The hole of the not-yet-bookmarked icon. */
export const HOLE: readonly Point[] = bookmark(6, 18, HOLE_TOP, 0.5, HOLE_BOTTOM, 14.77);
/**
 * The liquid is clipped to a slightly larger hole, so it overlaps the outline instead of meeting
 * it edge to edge, which would leave a faint antialiasing seam between two shapes of one colour.
 */
const CLIP: readonly Point[] = grow(HOLE, 0.25);

// --- Bending ----------------------------------------------------------------------------------

/**
 * How the icon is bent away from its rest shape. `bell` widens the top (narrows it when negative),
 * `waist` pinches the middle (bulges it when negative), `squash` lowers the top towards the bottom
 * edge, which stays where it is. The bottom edge never moves, so the sparks leave from fixed corners.
 */
export type Shape = { bell: number; waist: number; squash: number };
export const REST: Shape = { bell: 0, waist: 0, squash: 0 };

/** The icon's width at height y, as a multiple of its width at rest. */
export function widthAt(y: number, s: Shape): number {
  const u = Math.min(1, Math.max(0, (y - TOP) / (BOTTOM - TOP)));
  return 1 + s.bell * (1 - u) ** 2 - s.waist * Math.sin(Math.PI * u);
}

export function warp(p: Point, s: Shape): Point {
  return [CX + (p[0] - CX) * widthAt(p[1], s), BOTTOM - (BOTTOM - p[1]) * (1 - s.squash)];
}

// --- Time -------------------------------------------------------------------------------------

/** A short stroke with round caps, drawn in the liquid's colour. */
export type Spark = { x1: number; y1: number; x2: number; y2: number; width: number; alpha: number };

export type Frame = {
  /** 0 draws the outline in the icon's colour from before the click, 1 in its colour after. */
  tint: number;
  /** The liquid fills the icon down to this y. */
  front: number;
  shape: Shape;
  sparks: Spark[];
  /** Past the end: the icon is at rest and X's own icon can show again. */
  done: boolean;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const progress = (t: number, from: number, to: number): number => clamp01((t - from) / (to - from));
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const smooth = (p: number): number => p * p * (3 - 2 * p);

/** Where the sparks start and which way they fly: out of both bottom corners, and down from under the notch. */
const SPARKS: ReadonlyArray<{ at: Point; dir: Point }> = [
  { at: [3.2, 23.6], dir: [-Math.SQRT1_2, Math.SQRT1_2] },
  { at: [CX, 20.6], dir: [0, 1] },
  { at: [20.8, 23.6], dir: [Math.SQRT1_2, Math.SQRT1_2] },
];

/** Each spark starts as a dot, stretches into a dash as it flies out, and shrinks back to a fading dot. */
function sparksAt(q: number): Spark[] {
  if (q <= 0 || q >= 1) return [];
  const travel = 0.6 + 2.6 * easeOut(q);
  // Never quite zero: a zero-length stroke may lose its round caps, and the dot would vanish.
  const len = Math.max(0.02, 2.3 * Math.sin(Math.PI * Math.min(1, q / 0.85)));
  const width = 1.45 - 0.35 * q;
  const alpha = q < 0.65 ? 1 : 1 - (q - 0.65) / 0.35;
  return SPARKS.map(({ at, dir }) => ({
    x1: at[0] + dir[0] * travel,
    y1: at[1] + dir[1] * travel,
    x2: at[0] + dir[0] * (travel + len),
    y2: at[1] + dir[1] * (travel + len),
    width,
    alpha,
  }));
}

/**
 * The effect `time` ms after X switched the button. Timings follow @itsluneri's video, frame by frame.
 *
 * add: the outline takes the bookmarked colour, liquid pours in from the top with droplets ahead
 * of its edge while the top swells, then the icon wobbles back into shape and three sparks fly out.
 * remove: the top swells, the liquid drains back up, the icon settles and the outline fades to the
 * idle colour.
 */
export function frameAt(kind: EffectKind, time: number): Frame {
  if (!(time < DURATION[kind])) {
    return { tint: 1, front: kind === "add" ? FULL_FRONT : EMPTY_FRONT, shape: { ...REST }, sparks: [], done: true };
  }
  const t = Math.max(0, time);
  if (kind === "add") {
    const fill = progress(t, 80, 360);
    const after = Math.max(0, t - 360);
    const settle = 1 - smooth(progress(t, 720, 900));
    const bell = settle * (t < 360 ? 0.18 * Math.sin((Math.PI / 2) * fill) : 0.18 * Math.cos((2 * Math.PI * after) / 260) * Math.exp(-after / 140));
    const waist = settle * (t < 360 ? 0.06 * fill : 0.06 * Math.exp(-after / 60) - 0.1 * Math.sin((Math.PI * after) / 200) * Math.exp(-after / 160));
    return {
      tint: smooth(progress(t, 0, 110)),
      front: EMPTY_FRONT + (FULL_FRONT - EMPTY_FRONT) * easeInOut(fill),
      shape: { bell, waist, squash: 0.45 * bell },
      sparks: sparksAt(progress(t, 340, 880)),
      done: false,
    };
  }
  const swell = t < 160 ? Math.sin((Math.PI / 2) * progress(t, 0, 160)) : Math.cos((Math.PI / 2) * progress(t, 160, 460));
  const bell = 0.15 * swell;
  return {
    tint: smooth(progress(t, 380, 560)),
    front: FULL_FRONT + (EMPTY_FRONT - FULL_FRONT) * easeInOut(progress(t, 110, 420)),
    shape: { bell, waist: 0.05 * swell, squash: 0.45 * bell },
    sparks: [],
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

function circle(cx: number, cy: number, r: number): Point[] {
  const n = Math.max(8, Math.ceil((2 * Math.PI * r) / 0.3));
  // Angles grow clockwise on screen with y down, matching the other shapes, so they all add up
  // under the nonzero fill rule.
  return Array.from({ length: n }, (_, i): Point => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
}

/** The liquid down to `front`, unbent: a block above it, bumps along it, droplets below it. */
function liquidAt(front: number): Point[][] {
  const block: Point[] = [];
  const [x0, x1, top] = [CX - 9, CX + 9, -3];
  line(block, [x0, top], [x1, top], 1);
  line(block, [x1, top], [x1, front], 0.5);
  line(block, [x1, front], [x0, front], 1);
  line(block, [x0, front], [x0, top], 0.5);
  const out = [block];
  for (let k = -4; k <= 4; k++) out.push(circle(CX + k * EDGE.gap, front, EDGE.r));
  for (const row of DROPS) {
    for (let k = -4; k <= 4; k++) {
      const x = CX + (k + row.shift) * EDGE.gap;
      if (Math.abs(x - CX) <= 6.4) out.push(circle(x, front + row.dy, row.r));
    }
  }
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
