export type Locale = "en" | "zh";

export function detectLocale(lang?: string): Locale {
  const raw = (lang ?? detectBrowserLang()).toLowerCase();
  return raw.startsWith("zh") ? "zh" : "en";
}

function detectBrowserLang(): string {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) return chrome.i18n.getUILanguage();
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined") return navigator.language || "";
  return "en";
}

const EN: Record<string, string> = {
  appName: "Surprise Collection",
  optionsTitle: "Surprise Collection settings",
  subtitle: "Bookmarking a post on x.com fills the icon with liquid and a burst of sparks.",
  language: "Language",

  previewTitle: "Preview",
  previewTag: "Click the icon",
  previewTry: "Bookmark",
  previewReplay: "Replay",
  previewOff: "Off: x.com shows X's own icon swap",
  previewCaptionAdd: "Bookmarking: the icon fills from the top, wobbles and throws three sparks.",
  previewCaptionBoth: "Removing a bookmark drains the liquid back out.",
  previewCaptionNoRemove: "Removing a bookmark uses X's own icon swap.",
  previewMotion: "Your system asks for reduced motion, so x.com keeps X's own icon swap. The preview still plays here.",
  stepsLabel: "The effect, frame by frame",
  stepTint: "Tint",
  stepPour: "Pour",
  stepFill: "Fill",
  stepWobble: "Wobble",
  stepSparks: "Sparks",
  stepRest: "Done",

  effectTitle: "Effect",
  enabled: "Play the effect when you bookmark",
  enabledHelp: "Replaces X's instant icon swap on x.com. Bookmarking itself works exactly as before.",
  onRemove: "Also play it when you remove a bookmark",
  onRemoveHelp: "The liquid drains back out of the icon.",

  privacyTitle: "Data & privacy",
  privacyLead:
    "The extension runs only on x.com and twitter.com. It watches for the bookmark button switching after you click it or press B, and draws the effect over the icon. It never clicks anything, never reads your bookmarks or posts, makes no network requests and has no server.",
  srcClick: "Click the bookmark icon",
  srcClickDesc: "Under a post, in the timeline or on the post's own page",
  srcKey: "Press B",
  srcKeyDesc: "X's shortcut for the focused post. Typing in a text box never counts.",
  srcSkip: "Left alone",
  srcSkipDesc: "Icons X re-renders by itself, and the Bookmark item in the ··· menu",
  privacyStorage: "Settings are stored only in this browser (chrome.storage.local).",

  version: "Version {v}",
  reset: "Restore defaults",
  resetDone: "Defaults restored",
  resetNoop: "Already using the defaults",
  undo: "Undo",
  undone: "Previous settings restored",
  saved: "Saved",
  saveFailed: "Could not save",
};

const ZH: Record<string, string> = {
  appName: "Surprise Collection",
  optionsTitle: "Surprise Collection 设置",
  subtitle: "在 x.com 上收藏帖子时，图标会灌满液体，再迸出几道火花。",
  language: "语言",

  previewTitle: "预览",
  previewTag: "点一下图标",
  previewTry: "收藏",
  previewReplay: "重播",
  previewOff: "已关闭：x.com 上沿用 X 自己的图标切换",
  previewCaptionAdd: "收藏时：图标从上往下灌满，晃一晃，再迸出三道火花。",
  previewCaptionBoth: "取消收藏时，液体会退回去。",
  previewCaptionNoRemove: "取消收藏时沿用 X 自己的图标切换。",
  previewMotion: "系统开启了「减少动态效果」，x.com 上会沿用 X 自己的图标切换。这里的预览照常播放。",
  stepsLabel: "逐帧拆解",
  stepTint: "变色",
  stepPour: "灌入",
  stepFill: "灌满",
  stepWobble: "晃动",
  stepSparks: "火花",
  stepRest: "完成",

  effectTitle: "特效",
  enabled: "收藏时播放特效",
  enabledHelp: "替换 x.com 上 X 自带的图标瞬间切换。收藏功能本身完全不变。",
  onRemove: "取消收藏时也播放",
  onRemoveHelp: "液体从图标里退回去。",

  privacyTitle: "数据与隐私",
  privacyLead:
    "扩展只在 x.com 和 twitter.com 上运行。你点击收藏按钮或按 B 之后，它等按钮状态切换，再在图标上画出特效。它从不替你点击，不读取你的收藏和帖子，不发任何网络请求，也没有自己的服务器。",
  srcClick: "点击收藏图标",
  srcClickDesc: "帖子下方的图标，时间线和帖子详情页都算",
  srcKey: "按 B 键",
  srcKeyDesc: "X 给当前帖子加收藏的快捷键。在输入框里打字不算。",
  srcSkip: "不处理",
  srcSkipDesc: "X 自己重新渲染的图标，以及 ··· 菜单里的收藏项",
  privacyStorage: "设置只保存在这个浏览器里（chrome.storage.local）。",

  version: "版本 {v}",
  reset: "恢复默认设置",
  resetDone: "已恢复默认设置",
  resetNoop: "已经是默认设置",
  undo: "撤销",
  undone: "已撤销，恢复为之前的设置",
  saved: "已保存",
  saveFailed: "保存失败",
};

export const MESSAGES: Record<Locale, Record<string, string>> = { en: EN, zh: ZH };

export function t(locale: Locale, key: string): string {
  return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
}

/** t() with {name} placeholders filled from vars. Unknown names stay as written. */
export function tf(locale: Locale, key: string, vars: Record<string, string | number>): string {
  return t(locale, key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Word every [data-i18n] element's text and every [data-i18n-label] element's aria-label. */
export function applyI18n(root: ParentNode, locale: Locale): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(locale, key);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n-label]"))) {
    const key = el.dataset.i18nLabel;
    if (key) el.setAttribute("aria-label", t(locale, key));
  }
}
