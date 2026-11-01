/** DOM-free logic behind the options page, kept apart from options.ts so node --test can cover it. */
import type { EffectKind } from "../effect.ts";
import { t } from "../i18n.ts";
import type { Settings } from "../settings.ts";

/** The frames the "frame by frame" strip shows, with the ms each is taken at. */
export const STEPS: ReadonlyArray<{ key: string; kind: EffectKind; t: number }> = [
  { key: "stepTint", kind: "add", t: 100 },
  { key: "stepPour", kind: "add", t: 220 },
  { key: "stepFill", kind: "add", t: 340 },
  { key: "stepWobble", kind: "add", t: 420 },
  { key: "stepSparks", kind: "add", t: 560 },
  { key: "stepRest", kind: "add", t: Infinity },
];

export type PreviewModel = {
  /** The effect is off: the preview is greyed out and `badge` says so. */
  dimmed: boolean;
  badge: string | null;
  caption: string;
};

export function previewModel(s: Pick<Settings, "enabled" | "onRemove" | "locale">): PreviewModel {
  return {
    dimmed: !s.enabled,
    badge: s.enabled ? null : t(s.locale, "previewOff"),
    caption: s.enabled ? `${t(s.locale, "previewCaptionAdd")} ${t(s.locale, s.onRemove ? "previewCaptionBoth" : "previewCaptionNoRemove")}` : "",
  };
}

/** What a click on the preview icon plays: the opposite of its current state. */
export function previewToggle(bookmarked: boolean): EffectKind {
  return bookmarked ? "remove" : "add";
}

function settingsKey(s: Settings): string {
  return JSON.stringify([s.enabled, s.onRemove, s.locale, s.version]);
}

/**
 * Tells this page's own writes apart from changes made elsewhere. storage.onChanged also fires for
 * our writes, sometimes after newer ones were queued; filling the form from those stale echoes
 * would flip a switch back.
 */
export class EchoGuard {
  private pending: string[] = [];

  /** Call right before writing `s`. */
  expect(s: Settings): void {
    this.pending.push(settingsKey(s));
    if (this.pending.length > 16) this.pending.shift();
  }

  /** True when `s` is one of our writes coming back. Forgets it and any older ones. */
  take(s: Settings): boolean {
    const i = this.pending.indexOf(settingsKey(s));
    if (i < 0) return false;
    this.pending.splice(0, i + 1);
    return true;
  }
}
