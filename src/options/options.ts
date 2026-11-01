// The options page: a preview you can click, a frame-by-frame strip, and two switches.
import { frameAt, type EffectKind } from "../effect.ts";
import { applyI18n, detectLocale, t, tf, type Locale } from "../i18n.ts";
import { EffectView } from "../render.ts";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, onSettingsChange, restoreDefaults, sameSettings, saveSettings, type Settings } from "../settings.ts";
import { EchoGuard, previewModel, previewToggle, STEPS } from "./model.ts";

const TOAST_MS = 1600;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const ui = {
  locales: Array.from(document.querySelectorAll<HTMLInputElement>('input[name="locale"]')),
  enabled: $<HTMLInputElement>("#enabled"),
  onRemove: $<HTMLInputElement>("#onRemove"),
  onRemoveRow: $<HTMLElement>("#onRemoveRow"),
  stage: $<HTMLElement>("#stage"),
  previewButton: $<HTMLButtonElement>("#previewButton"),
  previewIcon: $<HTMLElement>("#previewIcon"),
  replay: $<HTMLButtonElement>("#replay"),
  previewBadge: $<HTMLElement>("#previewBadge"),
  previewCaption: $<HTMLElement>("#previewCaption"),
  previewMotion: $<HTMLElement>("#previewMotion"),
  steps: $<HTMLOListElement>("#steps"),
  version: $<HTMLElement>("#version"),
  reset: $<HTMLButtonElement>("#reset"),
  undo: $<HTMLButtonElement>("#undo"),
  toast: $<HTMLElement>("#toast"),
};

/** What the form shows; saved as soon as it changes. */
let state: Settings = { ...DEFAULT_SETTINGS, locale: detectLocale() };
/** Last value this page knows is in storage, so unchanged saves are skipped. */
let stored: Settings | null = null;
/** Settings from before "Restore defaults", while Undo is offered. */
let undoTo: Settings | null = null;
let toastTimer: number | null = null;
let paintedLocale: Locale | null = null;
const echoes = new EchoGuard();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const version = manifestVersion();

// The preview: X's idle grey and bookmarked blue, from the theme the page is in.
const css = getComputedStyle(document.documentElement);
const idle = (): string => css.getPropertyValue("--x-idle").trim() || "rgb(113, 118, 123)";
const blue = (): string => css.getPropertyValue("--x-blue").trim() || "rgb(29, 155, 240)";
const view = new EffectView(document);
ui.previewIcon.append(view.svg);
let bookmarked = false;
let anim = 0;

function manifestVersion(): string | null {
  try {
    return chrome.runtime.getManifest().version || null;
  } catch {
    return null;
  }
}

function rest(): void {
  cancelAnimationFrame(anim);
  view.rest(bookmarked, bookmarked ? blue() : idle());
}

function play(kind: EffectKind): void {
  cancelAnimationFrame(anim);
  bookmarked = kind === "add";
  paintToggle();
  const colors = kind === "add" ? { from: idle(), to: blue(), liquid: blue() } : { from: blue(), to: idle(), liquid: blue() };
  const start = performance.now();
  const step = (): void => {
    if (view.draw(kind, performance.now() - start, colors)) return;
    anim = requestAnimationFrame(step);
  };
  step();
}

function paintToggle(): void {
  ui.previewButton.setAttribute("aria-pressed", String(bookmarked));
}

/** The strip of still frames under the preview. Redrawn when the language or the theme changes. */
function paintSteps(): void {
  const items = STEPS.map((s) => {
    const li = document.createElement("li");
    const v = new EffectView(document);
    const f = frameAt(s.kind, s.t);
    v.draw(s.kind, s.t, { from: idle(), to: blue(), liquid: blue() });
    const name = document.createElement("span");
    name.textContent = t(state.locale, s.key);
    const ms = document.createElement("span");
    ms.className = "ms";
    ms.textContent = f.done ? "" : `${s.t} ms`;
    li.append(v.svg, name, ms);
    return li;
  });
  ui.steps.replaceChildren(...items);
}

function paint(): void {
  const locale = state.locale;
  if (locale !== paintedLocale) {
    paintedLocale = locale;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t(locale, "optionsTitle");
    applyI18n(document, locale);
    ui.version.hidden = !version;
    ui.version.textContent = version ? tf(locale, "version", { v: version }) : "";
    paintSteps();
  }
  for (const r of ui.locales) r.checked = r.value === locale;
  ui.enabled.checked = state.enabled;
  ui.onRemove.checked = state.onRemove;
  ui.onRemove.disabled = !state.enabled;
  ui.onRemoveRow.classList.toggle("is-off", !state.enabled);
  const vm = previewModel(state);
  ui.stage.classList.toggle("is-off", vm.dimmed);
  ui.previewBadge.hidden = vm.badge === null;
  ui.previewBadge.textContent = vm.badge ?? "";
  ui.previewCaption.textContent = vm.caption;
  ui.previewCaption.hidden = !vm.caption;
  ui.previewMotion.hidden = !reducedMotion.matches || !state.enabled;
  paintToggle();
}

function update(patch: Partial<Settings>, note = "saved"): void {
  const next = normalizeSettings({ ...state, ...patch });
  if (sameSettings(next, state)) return paint();
  hideUndo();
  state = next;
  paint();
  void flush(note);
}

async function flush(note: string): Promise<void> {
  const next = state;
  if (stored && sameSettings(next, stored)) return;
  echoes.expect(next);
  stored = next;
  try {
    await saveSettings(next);
    showToast(t(next.locale, note), "ok");
  } catch {
    stored = null;
    showToast(t(next.locale, "saveFailed"), "error");
  }
}

function showToast(text: string, kind: "ok" | "info" | "error"): void {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  ui.toast.dataset.kind = kind;
  // Clear first so a repeated "Saved" is still a change the live region announces. The hide timer
  // is armed only once the text is up, so a throttled timer cannot leave the toast stuck on screen.
  ui.toast.textContent = "";
  toastTimer = window.setTimeout(() => {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), TOAST_MS);
  }, 30);
}

function hideUndo(): void {
  if (!undoTo) return;
  undoTo = null;
  // Hiding the focused button would drop focus to <body>.
  if (document.activeElement === ui.undo) ui.reset.focus();
  ui.undo.hidden = true;
}

/** Storage changed. Our own writes come back here too and are dropped; anything else refills the form. */
function onStorage(next: Settings): void {
  if (echoes.take(next)) return;
  stored = next;
  if (sameSettings(next, state)) return;
  hideUndo();
  state = next;
  paint();
}

for (const r of ui.locales) {
  r.addEventListener("change", () => {
    if (r.checked && (r.value === "zh" || r.value === "en")) update({ locale: r.value });
  });
}
ui.enabled.addEventListener("change", () => update({ enabled: ui.enabled.checked }));
ui.onRemove.addEventListener("change", () => update({ onRemove: ui.onRemove.checked }));

// The preview always plays, even with the effect switched off or reduced motion on: you asked for it.
ui.previewButton.addEventListener("click", () => play(previewToggle(bookmarked)));
ui.replay.addEventListener("click", () => {
  bookmarked = false;
  play("add");
});

ui.reset.addEventListener("click", () => {
  const next = restoreDefaults(state);
  if (sameSettings(next, state)) {
    showToast(t(state.locale, "resetNoop"), "info");
    return;
  }
  const prev = state;
  update(next, "resetDone");
  undoTo = prev;
  ui.undo.hidden = false;
});
ui.undo.addEventListener("click", () => {
  const prev = undoTo;
  if (!prev) return;
  ui.reset.focus();
  update(prev, "undone");
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  rest();
  paintSteps();
});
reducedMotion.addEventListener("change", paint);

// Word the page in the browser language while storage answers.
rest();
paint();
void loadSettings().then((s) => {
  state = s;
  stored = s;
  paint();
  document.documentElement.dataset.ready = "1";
  onSettingsChange(onStorage);
});
