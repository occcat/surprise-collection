import type { EffectKind } from "./effect.ts";
import { detectLocale, type Locale } from "./i18n.ts";

export type Settings = {
  /** Play the effect when a post is bookmarked on x.com, in place of X's own icon swap. */
  enabled: boolean;
  /** Also play it when a bookmark is removed. */
  onRemove: boolean;
  locale: Locale;
  version: number;
};

export const SETTINGS_KEY = "settings";
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  onRemove: true,
  locale: "en",
  version: SETTINGS_VERSION,
};

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  return {
    enabled: r.enabled !== false,
    onRemove: r.onRemove !== false,
    locale: r.locale === "zh" || r.locale === "en" ? r.locale : detectLocale(),
    version: SETTINGS_VERSION,
  };
}

/**
 * Which effect to play when a bookmark button switches to `kind`, or null to leave X's own icon
 * swap alone. Reduced motion always wins: the effect bulges, shakes and throws sparks.
 */
export function effectToPlay(s: Pick<Settings, "enabled" | "onRemove">, kind: EffectKind, reducedMotion: boolean): EffectKind | null {
  if (!s.enabled || reducedMotion) return null;
  if (kind === "remove" && !s.onRemove) return null;
  return kind;
}

/** Stored settings, or the defaults in the browser's language. Never writes: the first save is the options page's. */
export async function loadSettings(): Promise<Settings> {
  try {
    const bag = await chrome.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(bag[SETTINGS_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS, locale: detectLocale() };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(s) });
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    fn(normalizeSettings(changes[SETTINGS_KEY].newValue));
  });
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return a.enabled === b.enabled && a.onRemove === b.onRemove && a.locale === b.locale && a.version === b.version;
}

/** Defaults, keeping the language: flipping it would reword the page under the "restored, undo" notice. */
export function restoreDefaults(current: Settings): Settings {
  return { ...DEFAULT_SETTINGS, locale: current.locale };
}
