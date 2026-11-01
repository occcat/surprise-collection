/**
 * On x.com: when you bookmark a post, play the liquid-fill effect over the bookmark icon in place
 * of X's instant swap; when you remove a bookmark, play it in reverse.
 *
 * X keeps the same <button> and flips its data-testid between "bookmark" and "removeBookmark",
 * swapping the <svg> inside, once its server has answered. The effect is drawn in a shadow root
 * laid over that icon, and X's own <svg> is hidden while it plays. Nothing else on the page is
 * changed, and nothing is clicked or sent.
 */
import { VIEWBOX, parseRgb, type EffectKind } from "./effect.ts";
import { EffectView, type Colors } from "./render.ts";
import { effectToPlay, loadSettings, onSettingsChange, type Settings } from "./settings.ts";

const ADD_ID = "bookmark";
const REMOVE_ID = "removeBookmark";
const BUTTON = `button[data-testid="${ADD_ID}"], button[data-testid="${REMOVE_ID}"]`;
/** A switch counts as yours if it comes this soon after you clicked the button or pressed B. X waits for its server first. */
const ARM_MS = 5000;
/** After the effect, how long to keep it on screen while X's icon catches up with the final colour. */
const HOLD_MS = 4000;
/** Frames X's icon colour must hold before it counts as the colour X ends on. */
const STEADY_FRAMES = 4;
/** X's bookmarked blue, until a bookmarked icon on the page shows the real colour. */
const DEFAULT_ACCENT = "rgb(29, 155, 240)";
const HOST_TAG = "surprise-collection-effect";
const HOST_CSS = `
:host {
  all: initial;
  position: absolute;
  display: block;
  pointer-events: none;
  contain: layout style;
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
`;

/** Null until storage answers, so a switched-off extension never plays in the first moments of a page. */
let settings: Settings | null = null;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The button you just clicked (or the post you pressed B on), and its icon colour at that moment. */
let armed: { button: Element | null; article: Element | null; at: number; color: string } | null = null;
/** The bookmarked colour, learnt from a bookmarked icon at rest. */
let accent: string | null = null;
const playing = new WeakMap<Element, Playing>();

const iconOf = (button: Element): SVGSVGElement | null => button.querySelector("svg");
const colorOf = (el: Element | null): string => (el ? getComputedStyle(el).color : "");

function sameColor(a: string, b: string): boolean {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (!pa || !pb) return a === b;
  return pa.every((v, i) => Math.abs(v - (pb[i] ?? v)) <= 2);
}

/** X's idle icon colour next to `button`: the reply icon in the same row is never highlighted. */
function idleColor(button: Element): string {
  return colorOf(button.closest('[role="group"]')?.querySelector('[data-testid="reply"] svg') ?? null);
}

/**
 * A bookmarked colour read off `button`'s icon, or null when the icon isn't showing one. X flips a
 * button to "removeBookmark" at once but only colours it about a second later, so a bookmarked
 * button can still be idle grey.
 */
function bookmarkedColorOf(button: Element): string | null {
  if (button.getAttribute("data-testid") !== REMOVE_ID || playing.has(button)) return null;
  const c = colorOf(iconOf(button));
  const idle = idleColor(button);
  return parseRgb(c) && !(idle && sameColor(c, idle)) ? c : null;
}

/** The bookmarked colour: learnt earlier, or read off a bookmarked icon on the page. */
function accentColor(): string {
  if (accent) return accent;
  for (const b of Array.from(document.querySelectorAll(`button[data-testid="${REMOVE_ID}"]`))) {
    const c = bookmarkedColorOf(b);
    if (c) return (accent = c);
  }
  return DEFAULT_ACCENT;
}

function inEditable(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest("input, textarea, select")) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

function arm(button: Element | null, article: Element | null): void {
  const known = button ? bookmarkedColorOf(button) : null;
  if (known) accent = known;
  armed = { button, article, at: performance.now(), color: colorOf(button ? iconOf(button) : null) };
}

/** The icon colour from your click, if `button` switched because of it. Uses up the arming. */
function takeArmed(button: Element): string | null {
  const a = armed;
  if (!a || performance.now() - a.at > ARM_MS) return null;
  if (a.button !== button && (a.article === null || button.closest("article") !== a.article)) return null;
  armed = null;
  return a.color;
}

class Playing {
  private readonly host: HTMLElement;
  private readonly view: EffectView;
  private readonly start = performance.now();
  private hidden: SVGSVGElement | null = null;
  private frame = 0;
  private colors: Colors;
  private last = "";
  private steady = 0;

  constructor(
    private readonly button: Element,
    private readonly kind: EffectKind,
    from: string,
  ) {
    // Adding starts from the icon's colour at your click. Removing starts from the bookmarked
    // colour even if you were quicker than X's colouring, and ends on X's idle colour, which X
    // sets as soon as it switches the button.
    const bookmarked = accentColor();
    this.colors = kind === "add" ? { from: from || idleColor(button) || bookmarked, to: bookmarked } : { from: bookmarked, to: bookmarked };
    this.host = document.createElement(HOST_TAG);
    // place() corrects by the measured offset. Starting from 0 rather than "auto" makes that
    // offset relative to the containing block, not to wherever the static position happens to be.
    this.host.style.left = "0px";
    this.host.style.top = "0px";
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = HOST_CSS;
    this.view = new EffectView(document);
    shadow.append(style, this.view.svg);
    this.tick();
  }

  /** One frame. Re-reads X's icon every time: X may re-render it, and the page may scroll. */
  private readonly tick = (): void => {
    const icon = iconOf(this.button);
    if (!this.button.isConnected || !icon?.parentElement) return this.stop();
    const live = colorOf(icon);
    // X fades its icon to the new colour over 0.2 s. Only a colour that has held for a few frames
    // is the one X ends on; anything earlier is part of the fade.
    this.steady = sameColor(live, this.last) ? this.steady + 1 : 0;
    this.last = live;
    const settled = this.steady >= STEADY_FRAMES;
    if (this.kind === "remove") this.colors.to = live;
    else if (settled && parseRgb(live) && !sameColor(live, this.colors.from) && !sameColor(live, this.colors.to)) {
      // X has coloured its icon: that is the bookmarked colour to end on.
      accent = live;
      this.colors = { ...this.colors, to: live };
    }
    this.hide(icon);
    if (this.host.parentElement !== icon.parentElement) icon.parentElement.append(this.host);
    if (!this.place(icon)) return this.stop();
    const t = performance.now() - this.start;
    const done = this.view.draw(this.kind, t, this.colors);
    // X may take a moment to give its own icon the final colour. Until then the finished effect
    // stays on top, so the icon doesn't flash back to grey.
    if (done && ((settled && sameColor(live, this.colors.to)) || t > HOLD_MS)) return this.stop();
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Lay the host over the icon, with the effect's viewBox margins around it. False if the icon has no size. */
  private place(icon: SVGSVGElement): boolean {
    const r = icon.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const unit = r.width / 24;
    const s = this.host.style;
    s.width = `${VIEWBOX.w * unit}px`;
    s.height = `${VIEWBOX.h * unit}px`;
    // Measure where the host is now and move it by the difference: its containing block is
    // whichever ancestor X happens to position, so there is nothing fixed to offset from.
    const h = this.host.getBoundingClientRect();
    s.left = `${(parseFloat(s.left) || 0) + r.left + VIEWBOX.x * unit - h.left}px`;
    s.top = `${(parseFloat(s.top) || 0) + r.top + VIEWBOX.y * unit - h.top}px`;
    return true;
  }

  private hide(icon: SVGSVGElement): void {
    if (this.hidden === icon) return;
    this.show();
    icon.style.setProperty("visibility", "hidden");
    this.hidden = icon;
  }

  private show(): void {
    const icon = this.hidden;
    this.hidden = null;
    if (!icon) return;
    icon.style.removeProperty("visibility");
    if (icon.getAttribute("style") === "") icon.removeAttribute("style");
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.show();
    this.host.remove();
    if (playing.get(this.button) === this) playing.delete(this.button);
  }
}

function onSwitch(button: Element, was: string | null): void {
  const now = button.getAttribute("data-testid");
  const kind: EffectKind | null = was === ADD_ID && now === REMOVE_ID ? "add" : was === REMOVE_ID && now === ADD_ID ? "remove" : null;
  if (!kind) return;
  const from = takeArmed(button);
  if (from === null || !settings) return;
  playing.get(button)?.stop();
  const k = effectToPlay(settings, kind, reducedMotion.matches);
  if (k) playing.set(button, new Playing(button, k, from));
}

// MutationObserver callbacks run before the next paint, so X's new icon never shows uncovered.
const observer = new MutationObserver((records) => {
  for (const r of records) {
    if (r.target instanceof HTMLButtonElement) onSwitch(r.target, r.oldValue);
  }
});

function onClick(e: MouseEvent): void {
  const button = e.target instanceof Element ? e.target.closest(BUTTON) : null;
  if (button) arm(button, button.closest("article"));
}

/** X's keyboard shortcut: B bookmarks the focused post. */
function onKey(e: KeyboardEvent): void {
  if (e.key.toLowerCase() !== "b" || e.repeat || e.altKey || e.ctrlKey || e.metaKey || inEditable(e.target)) return;
  const article = document.activeElement?.closest("article") ?? null;
  if (article) arm(article.querySelector(BUTTON), article);
}

function apply(next: Settings): void {
  settings = next;
}

// Capture: X's own handlers may stop the event before it reaches window.
window.addEventListener("click", onClick, true);
window.addEventListener("keydown", onKey, true);
observer.observe(document, { subtree: true, attributes: true, attributeFilter: ["data-testid"], attributeOldValue: true });
void loadSettings().then(apply);
onSettingsChange(apply);
