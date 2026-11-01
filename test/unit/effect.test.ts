import { test } from "node:test";
import assert from "node:assert/strict";
import { DURATION, EMPTY_FRONT, FULL_FRONT, frameAt, geometry, HOLE, mixColor, OUTER, parseRgb, REST, track, VIEWBOX, warp, widthAt, type EffectKind } from "../../src/effect.ts";

const KINDS: EffectKind[] = ["add", "remove"];
const every = (kind: EffectKind, step = 10): number[] => Array.from({ length: Math.floor(DURATION[kind] / step) }, (_, i) => i * step);

test("at rest the outline is X's icon: outer edge 4–20 × 2–22.94, hole 6–18 × 4–19.06", () => {
  const box = (ps: readonly (readonly [number, number])[]) => ({
    x0: Math.min(...ps.map((p) => p[0])),
    x1: Math.max(...ps.map((p) => p[0])),
    y0: Math.min(...ps.map((p) => p[1])),
    y1: Math.max(...ps.map((p) => p[1])),
  });
  assert.deepEqual(box(OUTER), { x0: 4, x1: 20, y0: 2, y1: 22.94 });
  assert.deepEqual(box(HOLE), { x0: 6, x1: 18, y0: 4, y1: 19.06 });
  for (const p of OUTER) {
    const [x, y] = warp(p, REST);
    assert.ok(Math.abs(x - p[0]) < 1e-9 && Math.abs(y - p[1]) < 1e-9);
  }
});

test("both effects end at rest: add on the filled icon, remove on the outline", () => {
  const add = frameAt("add", DURATION.add);
  assert.equal(add.done, true);
  assert.equal(add.tint, 1);
  assert.deepEqual(add.shape, REST);
  assert.deepEqual(add.sparks, []);
  assert.deepEqual(geometry(add), { body: geometry(add).body, hole: null, liquid: null, clip: null });

  const remove = frameAt("remove", Infinity);
  assert.equal(remove.done, true);
  const g = geometry(remove);
  assert.ok(g.hole && !g.liquid);
});

test("each effect starts where X's icon was: add on the outline, remove on the filled icon", () => {
  const add = frameAt("add", 0);
  assert.ok(add.front <= EMPTY_FRONT);
  assert.equal(add.tint, 0);
  assert.ok(geometry(add).hole && !geometry(add).liquid);
  const remove = frameAt("remove", 0);
  assert.ok(remove.front >= FULL_FRONT);
  assert.equal(geometry(remove).hole, null);
});

test("the liquid only ever pours down when adding and drains up when removing", () => {
  for (const kind of KINDS) {
    let last = frameAt(kind, 0).front;
    for (const t of every(kind)) {
      const f = frameAt(kind, t);
      if (kind === "add") assert.ok(f.front >= last - 1e-9, `${kind} ${t}`);
      else assert.ok(f.front <= last + 1e-9, `${kind} ${t}`);
      last = f.front;
    }
  }
});

test("the icon keeps its bottom edge and stays inside the effect's box", () => {
  for (const kind of KINDS) {
    for (const t of every(kind)) {
      const s = frameAt(kind, t).shape;
      assert.equal(warp([4, 22.94], s)[1], 22.94);
      for (const p of OUTER) {
        const [x, y] = warp(p, s);
        assert.ok(x > VIEWBOX.x && x < VIEWBOX.x + VIEWBOX.w && y > VIEWBOX.y && y < VIEWBOX.y + VIEWBOX.h, `${kind} ${t}: ${x},${y}`);
      }
      assert.ok(widthAt(12, s) > 0.7 && widthAt(12, s) < 1.3);
    }
  }
});

test("the jelly follows the reference video: stretch, squash, rebound", () => {
  // Measured at 60 fps from @itsluneri's video: 6 % taller while the outline turns blue, 13 %
  // shorter when the liquid lands, a small stretch on the rebound.
  const sq = (t: number) => frameAt("add", t).shape.squash;
  assert.ok(Math.abs(sq(100) + 0.06) < 0.002);
  assert.ok(Math.abs(sq(233) - 0.129) < 0.002);
  assert.ok(Math.abs(sq(367) + 0.043) < 0.002);
  assert.ok(Math.abs(frameAt("remove", 183).shape.squash - 0.094) < 0.002);
  // The bulge runs down the icon when bookmarking and up it when removing.
  assert.ok(frameAt("add", 200).shape.at < frameAt("add", 300).shape.at);
  assert.ok(frameAt("remove", 160).shape.at > frameAt("remove", 300).shape.at);
  // Squashed, the icon widens to keep its volume.
  assert.ok(widthAt(12, frameAt("add", 233).shape) > 1.05);
});

test("track() passes through every key and holds its ends", () => {
  const keys = [[0, 0], [10, 1], [30, -1], [40, 0]];
  for (const [t, v] of keys) assert.ok(Math.abs(track(keys, t ?? 0) - (v ?? 0)) < 1e-9);
  assert.equal(track(keys, -5), 0);
  assert.equal(track(keys, 99), 0);
  assert.equal(track([[0, 1, 5], [10, 1, 7]], 5, 2), 6);
});

test("the liquid's edge is a halftone: tabs, then large dots, then small dots", () => {
  const g = geometry(frameAt("add", 200));
  // One block, eight tabs, seven large dots, six small dots.
  assert.equal(g.liquid?.match(/M/g)?.length, 22);
});

test("the liquid falls in faster and faster, and drains out slower and slower", () => {
  const f = (k: EffectKind, t: number) => frameAt(k, t).front;
  assert.ok(f("add", 200) - f("add", 150) > f("add", 150) - f("add", 100));
  assert.ok(f("remove", 250) - f("remove", 300) > f("remove", 300) - f("remove", 350));
  assert.ok(f("add", 280) >= FULL_FRONT);
  assert.ok(f("remove", 400) <= EMPTY_FRONT);
});

test("add throws three sparks out below the icon after the fill; remove throws none", () => {
  assert.deepEqual(frameAt("add", 200).sparks, []);
  const s = frameAt("add", 500).sparks;
  assert.equal(s.length, 3);
  for (const k of s) assert.ok(k.y1 > 22 && k.alpha > 0);
  const [left, mid, right] = s;
  assert.ok(left && mid && right && left.x2 < left.x1 && right.x2 > right.x1 && mid.x1 === mid.x2);
  for (const t of every("remove")) assert.deepEqual(frameAt("remove", t).sparks, []);
});

test("sparks never leave the effect's box", () => {
  for (const t of every("add", 5)) {
    for (const k of frameAt("add", t).sparks) {
      for (const [x, y] of [[k.x1, k.y1], [k.x2, k.y2]] as const) {
        const pad = k.width / 2;
        assert.ok(x - pad >= VIEWBOX.x && x + pad <= VIEWBOX.x + VIEWBOX.w && y + pad <= VIEWBOX.y + VIEWBOX.h, `${t}: ${x},${y}`);
      }
    }
  }
});

test("geometry gives clipped liquid only while the hole is part full", () => {
  const mid = geometry(frameAt("add", 220));
  assert.ok(mid.hole && mid.liquid && mid.clip);
  assert.match(mid.body, /^M[\d. -]+(L[\d. -]+)+Z$/);
  // Path data never carries NaN or Infinity, at any moment.
  for (const kind of KINDS) {
    for (const t of every(kind, 7)) {
      const g = geometry(frameAt(kind, t));
      for (const d of [g.body, g.hole, g.liquid, g.clip]) assert.ok(d === null || !/NaN|Infinity/.test(d), `${kind} ${t}`);
    }
  }
});

test("negative and missing times are safe", () => {
  assert.ok(frameAt("add", -50).front <= EMPTY_FRONT);
  assert.equal(frameAt("add", Number.NaN).done, true);
});

test("parseRgb and mixColor", () => {
  assert.deepEqual(parseRgb("rgb(29, 155, 240)"), [29, 155, 240]);
  assert.deepEqual(parseRgb("rgba(0, 0, 0, 0.5)"), [0, 0, 0]);
  assert.deepEqual(parseRgb("#1d9bf0"), [29, 155, 240]);
  assert.equal(parseRgb("currentColor"), null);
  assert.equal(mixColor("rgb(0, 0, 0)", "rgb(200, 100, 50)", 0.5), "rgb(100, 50, 25)");
  assert.equal(mixColor("red", "blue", 0.2), "red");
  assert.equal(mixColor("red", "blue", 0.8), "blue");
  assert.equal(mixColor("rgb(1, 2, 3)", "rgb(9, 9, 9)", 0), "rgb(1, 2, 3)");
});
