// Build the extension into dist/.
//
//   node build.mjs           once
//   node build.mjs --watch   rebuild on change
//
// Needs Node 22.18 or later: it imports src/i18n.ts to word the options page.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist");
const watch = process.argv.includes("--watch");

const { t } = await import(pathToFileURL(join(SRC, "i18n.ts")).href);
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Each {{key}} in options.html becomes its English message; the page rewords itself in the chosen language as it loads. */
function optionsHtml() {
  return readFileSync(join(SRC, "options/options.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const text = t("en", key);
    if (text === key) throw new Error(`options.html: no message ${key}`);
    return escapeHtml(text);
  });
}

function copyStatic() {
  cpSync(join(SRC, "manifest.json"), join(OUT, "manifest.json"));
  writeFileSync(join(OUT, "options.html"), optionsHtml());
  cpSync(join(SRC, "options/options.css"), join(OUT, "options.css"));
  cpSync(join(ROOT, "icons"), join(OUT, "icons"), { recursive: true });
  cpSync(join(SRC, "_locales"), join(OUT, "_locales"), { recursive: true });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ctx = await esbuild.context({
  entryPoints: {
    content: join(SRC, "content.ts"),
    background: join(SRC, "background.ts"),
    options: join(SRC, "options/options.ts"),
  },
  absWorkingDir: ROOT,
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: OUT,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [{ name: "static", setup: (b) => b.onEnd((r) => r.errors.length === 0 && copyStatic()) }],
});

if (watch) {
  await ctx.watch();
  console.log("watching, output in dist/");
} else {
  try {
    await ctx.rebuild();
  } finally {
    await ctx.dispose();
  }
  // The repo root has no manifest.json, so pointing Chrome at it fails with "Manifest file is missing or unreadable".
  console.log(`built into dist/\nIn chrome://extensions, choose "Load unpacked" and select:\n  ${OUT}`);
}
