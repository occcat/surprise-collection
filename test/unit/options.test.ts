import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESSAGES } from "../../src/i18n.ts";
import { EchoGuard, previewModel, previewToggle, STEPS } from "../../src/options/model.ts";
import { DEFAULT_SETTINGS, effectToPlay, normalizeSettings, restoreDefaults, sameSettings } from "../../src/settings.ts";

test("both languages have the same message keys", () => {
  assert.deepEqual(Object.keys(MESSAGES.zh).sort(), Object.keys(MESSAGES.en).sort());
});

test("every key the options page uses exists", () => {
  const html = readFileSync(new URL("../../src/options/options.html", import.meta.url), "utf8");
  const keys = new Set([...html.matchAll(/\{\{(\w+)\}\}|data-i18n(?:-label)?="(\w+)"/g)].map((m) => m[1] ?? m[2]));
  for (const k of [...keys, ...STEPS.map((s) => s.key)]) assert.ok(k && k in MESSAGES.en, `missing message ${k}`);
});

test("normalizeSettings fills defaults and keeps what is valid", () => {
  assert.deepEqual(normalizeSettings({ locale: "zh" }), { ...DEFAULT_SETTINGS, locale: "zh" });
  assert.deepEqual(normalizeSettings({ enabled: false, onRemove: false, locale: "en", extra: 1 }), { enabled: false, onRemove: false, locale: "en", version: 1 });
  assert.ok(["en", "zh"].includes(normalizeSettings({ locale: "fr" }).locale));
  assert.equal(normalizeSettings(null).enabled, true);
});

test("restoreDefaults keeps the language", () => {
  const s = restoreDefaults({ enabled: false, onRemove: false, locale: "zh", version: 1 });
  assert.ok(sameSettings(s, { ...DEFAULT_SETTINGS, locale: "zh" }));
});

test("effectToPlay follows the switches, and reduced motion leaves X's swap alone", () => {
  const on = { enabled: true, onRemove: true };
  assert.equal(effectToPlay(on, "add", false), "add");
  assert.equal(effectToPlay(on, "remove", false), "remove");
  assert.equal(effectToPlay({ enabled: true, onRemove: false }, "remove", false), null);
  assert.equal(effectToPlay({ enabled: true, onRemove: false }, "add", false), "add");
  assert.equal(effectToPlay({ enabled: false, onRemove: true }, "add", false), null);
  assert.equal(effectToPlay(on, "add", true), null);
});

test("preview: on describes the effect, off greys out with a badge", () => {
  const on = previewModel({ enabled: true, onRemove: true, locale: "en" });
  assert.equal(on.dimmed, false);
  assert.equal(on.badge, null);
  assert.ok(on.caption.includes(MESSAGES.en.previewCaptionBoth ?? "?"));
  assert.ok(previewModel({ enabled: true, onRemove: false, locale: "zh" }).caption.includes(MESSAGES.zh.previewCaptionNoRemove ?? "?"));
  const off = previewModel({ enabled: false, onRemove: true, locale: "zh" });
  assert.equal(off.dimmed, true);
  assert.equal(off.badge, MESSAGES.zh.previewOff);
  assert.equal(off.caption, "");
});

test("the preview icon plays the opposite of its state", () => {
  assert.equal(previewToggle(false), "add");
  assert.equal(previewToggle(true), "remove");
});

test("EchoGuard drops our own writes and older ones", () => {
  const g = new EchoGuard();
  const a = { ...DEFAULT_SETTINGS, onRemove: false };
  const b = { ...DEFAULT_SETTINGS, enabled: false };
  g.expect(a);
  g.expect(b);
  assert.equal(g.take(b), true);
  assert.equal(g.take(a), false);
});
