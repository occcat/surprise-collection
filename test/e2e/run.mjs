// Development only: load dist/ into headless Chrome for Testing, point x.com at a local page whose
// bookmark buttons switch the way X's do, and check the effect plays over them.
//
//   npm run build && node test/e2e/run.mjs [--shots <dir>] [--readme <dir>]
//
// --shots writes every options-page variant (light/dark × zh/en × 1280/375 px). --readme writes the
// images the READMEs use: the English and Chinese options page in light and dark, and the effect
// frame by frame in light and dark.
//
// CHROME overrides the browser. Branded Google Chrome ignores --load-extension, so the default is
// Playwright's Chrome for Testing.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(ROOT, "dist");
const argDir = (flag) => {
  const at = process.argv.indexOf(flag);
  return at > 0 ? resolve(process.argv[at + 1] ?? "shots") : null;
};
const SHOTS = argDir("--shots");
const README = argDir("--readme");

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = join(homedir(), "Library/Caches/ms-playwright");
  const builds = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])) : [];
  for (const b of builds) {
    for (const arch of ["chrome-mac-arm64", "chrome-mac"]) {
      const p = join(base, b, arch, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("no Chrome for Testing found; set CHROME");
}

if (!existsSync(join(DIST, "manifest.json"))) throw new Error("dist/ is missing; run npm run build first");

const work = mkdtempSync(join(tmpdir(), "sc-e2e-"));
let chrome = null;
let server = null;
const cleanup = () => {
  try {
    chrome?.kill("SIGKILL");
  } catch {
    /* gone */
  }
  server?.close();
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* helpers may still hold the profile for a moment */
  }
};
process.once("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, () => process.exit(130));

// --- A stand-in for x.com ---------------------------------------------------------------------
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=x.com", "-addext", "subjectAltName=DNS:x.com,DNS:twitter.com", "-keyout", join(work, "key.pem"), "-out", join(work, "cert.pem")], { stdio: "ignore" });

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>X</title>
<style>
body{margin:0;min-height:100vh;font:15px system-ui;background:var(--bg,#fff);color:var(--fg,#0f1419)}
main{max-width:600px;margin:0 auto;padding:24px;border-inline:1px solid #8884;min-height:100vh}
article{padding:12px 0;border-bottom:1px solid #8884}
[role=group]{display:flex;justify-content:space-between;max-width:425px;margin-top:12px}
button{all:unset;cursor:pointer;display:flex}
button>div{display:flex;align-items:center;transition:color .2s}
.ic{position:relative;display:flex}
svg{width:18.75px;height:18.75px;fill:currentColor}
</style></head>
<body><main>
<article tabindex="0"><b>Jack</b> @jack · Mar 21, 2006<p>just setting up my twttr</p><div role="group" id="g1"></div></article>
<article tabindex="0"><b>Jack</b> @jack · Mar 22, 2006<p>inviting coworkers</p><div role="group" id="g2"></div></article>
<textarea id="ta" rows="2" cols="60"></textarea>
</main>
<script>
const q = new URLSearchParams(location.search);
if (q.get("bg")) document.body.style.setProperty("--bg", q.get("bg"));
if (q.get("fg")) document.body.style.setProperty("--fg", q.get("fg"));
// What X's bookmark button does, as seen on x.com in November 2026: the same <button> stays, its
// data-testid flips between "bookmark" and "removeBookmark", and the <svg> inside is replaced.
// When bookmarking, the new filled icon stays grey for about a second before the inner div's
// inline grey is dropped and it fades to the bookmarked blue. When removing, it goes grey at once.
const OUTLINE = "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z";
const FILLED = "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z";
const GREY = "rgb(113, 118, 123)", BLUE = "rgb(29, 155, 240)";
window.serverMs = 120;
window.colorMs = 900;
function icon(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  g.append(p); svg.append(g);
  return svg;
}
function other(id) {
  const b = document.createElement("button");
  b.dataset.testid = id;
  const inner = document.createElement("div");
  inner.style.color = GREY;
  const ic = document.createElement("div");
  ic.className = "ic";
  ic.append(icon("M2 4h20v16H2z"));
  inner.append(ic); b.append(inner);
  return b;
}
function bookmarkButton() {
  const b = document.createElement("button");
  b.dataset.testid = "bookmark";
  b.setAttribute("aria-label", "Bookmark");
  const inner = document.createElement("div");
  inner.style.color = GREY;
  const ic = document.createElement("div");
  ic.className = "ic";
  ic.append(icon(OUTLINE));
  inner.append(ic); b.append(inner);
  const flip = () => {
    const on = b.dataset.testid === "bookmark";
    ic.replaceChildren(icon(on ? FILLED : OUTLINE));
    b.dataset.testid = on ? "removeBookmark" : "bookmark";
    b.setAttribute("aria-label", on ? "Bookmarked" : "Bookmark");
    if (on) setTimeout(() => { inner.removeAttribute("style"); inner.style.color = BLUE; }, window.colorMs);
    else inner.style.color = GREY;
  };
  b.addEventListener("click", (e) => { e.stopPropagation(); setTimeout(flip, window.serverMs); });
  b.flip = flip;
  return b;
}
for (const g of document.querySelectorAll("[role=group]")) g.append(other("reply"), other("retweet"), other("like"), bookmarkButton());
document.addEventListener("keydown", (e) => {
  if (e.key !== "b" || e.target.closest?.("textarea")) return;
  const a = document.activeElement?.closest("article");
  const b = a?.querySelector("[data-testid=bookmark],[data-testid=removeBookmark]");
  if (b) setTimeout(b.flip, window.serverMs);
});
// Re-render without a click, as X does when a post's data refreshes.
window.rerender = (n) => document.querySelector("#g" + n + " button:last-child").flip();
</script></body></html>`;

server = createServer({ key: readFileSync(join(work, "key.pem")), cert: readFileSync(join(work, "cert.pem")) }, (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// --- Chrome -----------------------------------------------------------------------------------
const profile = join(work, "profile");
chrome = spawn(
  findChrome(),
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    `--host-resolver-rules=MAP x.com 127.0.0.1:${port}, MAP twitter.com 127.0.0.1:${port}`,
    "--ignore-certificate-errors",
    "--no-proxy-server",
    "--lang=en-US",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(100);
  try {
    const p = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
    wsUrl = (await (await fetch(`http://127.0.0.1:${p}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    /* not up yet */
  }
}
if (!wsUrl) throw new Error("Chrome did not open a DevTools port");

// --- A small CDP client: one browser socket, flat sessions ------------------------------------
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => {
  ws.addEventListener("open", r, { once: true });
  ws.addEventListener("error", j, { once: true });
});
let seq = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id !== undefined) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p?.reject(new Error(`${p.method}: ${m.error.message}`));
    else p?.resolve(m.result);
    return;
  }
  for (const w of waiters.splice(0)) (w.match(m) ? w.resolve(m.params) : waiters.push(w));
});
function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method}: no reply`)), 15_000);
    pending.set(id, { method, resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
  });
}
function once(method, sessionId, ms = 15_000) {
  return new Promise((resolve, reject) => {
    const w = { match: (m) => m.method === method && m.sessionId === sessionId, resolve };
    waiters.push(w);
    setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), ms).unref();
  });
}

async function openPage() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Emulation.setFocusEmulationEnabled", { enabled: true });
  return {
    s,
    async goto(url) {
      const loaded = once("Page.loadEventFired", sessionId);
      await s("Page.navigate", { url });
      await loaded;
    },
    async eval(expression, userGesture = false) {
      const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture });
      if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    async until(expression, ms = 4000) {
      const t0 = Date.now();
      for (;;) {
        const v = await this.eval(expression);
        if (v) return v;
        if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${expression}`);
        await sleep(20);
      }
    },
    /** A real mouse click at the centre of the element `selector` finds. */
    async click(selector) {
      const box = await this.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      for (const type of ["mousePressed", "mouseReleased"]) await s("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
    },
    async key(key, code) {
      for (const type of ["keyDown", "keyUp"]) await s("Input.dispatchKeyEvent", { type, key, code, text: type === "keyDown" ? key : undefined, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
    },
    async media(features) {
      await s("Emulation.setEmulatedMedia", { features });
    },
    async shot(file, width, fullPage = true) {
      await s("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: width < 600 });
      const size = await this.eval(`({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, vw: innerWidth })`);
      if (fullPage) await s("Emulation.setDeviceMetricsOverride", { width, height: size.h, deviceScaleFactor: 2, mobile: width < 600 });
      await sleep(250);
      const { data } = await s("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(data, "base64"));
      return size;
    },
    async shotClip(file, clip, scale = 1) {
      const { data } = await s("Page.captureScreenshot", { format: "png", clip: { ...clip, scale }, captureBeyondViewport: true });
      writeFileSync(file, Buffer.from(data, "base64"));
    },
  };
}

// An unpacked extension's id: the first 32 hex digits of the SHA-256 of its absolute path, each
// digit mapped to a–p. Matched against the running service workers, since Chrome's own component
// extensions run service workers too.
const extId = [...createHash("sha256").update(realpathSync(DIST)).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
let up = false;
for (let i = 0; i < 50 && !up; i++) {
  const { targetInfos } = await send("Target.getTargets");
  up = targetInfos.some((t) => t.type === "service_worker" && t.url.startsWith(`chrome-extension://${extId}/`));
  if (!up) await sleep(100);
}
if (!up) throw new Error(`the extension did not load (expected id ${extId})`);

// --- Checks -----------------------------------------------------------------------------------
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${ok || !detail ? "" : `\n    ${detail}`}`);
  if (!ok) failed++;
}

const BTN = (n) => `#g${n} button:last-child`;
const HOST = (n) => `#g${n} surprise-collection-effect`;
/** What the extension has on screen for post n: its overlay, and whether X's own icon is hidden. */
const effectState = (x, n) =>
  x.eval(`(() => {
    const b = document.querySelector(${JSON.stringify(BTN(n))});
    const host = document.querySelector(${JSON.stringify(HOST(n))});
    const svg = b.querySelector("svg");
    const o = host?.getBoundingClientRect(), r = svg.getBoundingClientRect();
    const paths = host?.shadowRoot?.querySelectorAll("path") ?? [];
    return {
      id: b.dataset.testid,
      host: !!host,
      hidden: getComputedStyle(svg).visibility === "hidden",
      // Where the overlay's 24 px icon box sits relative to X's icon, in CSS px.
      dx: o ? Math.round((o.left + (3 / 30) * o.width - r.left) * 10) / 10 : null,
      dy: o ? Math.round((o.top + (3 / 32) * o.height - r.top) * 10) / 10 : null,
      scale: o ? Math.round(((o.width * 24) / 30 / r.width) * 100) / 100 : null,
      liquid: [...paths].some((p) => p.getAttribute("clip-path") && p.getAttribute("display") !== "none"),
      sparks: [...(host?.shadowRoot?.querySelectorAll("line") ?? [])].filter((l) => l.getAttribute("display") !== "none").length,
      svgStyle: svg.getAttribute("style"),
    };
  })()`);

/** The effect has finished and handed the icon back to X. Bookmarking holds it until X has coloured its own icon. */
const settled = (x, n) => x.until(`!document.querySelector(${JSON.stringify(HOST(n))})`, 6000);

const x = await openPage();
await x.s("Emulation.setDeviceMetricsOverride", { width: 1100, height: 700, deviceScaleFactor: 2, mobile: false });
await x.goto("https://x.com/jack/status/20");
// The content script leaves no marker on the page. Give it a moment to load its settings.
await sleep(300);

await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "removeBookmark"`);
let st = await effectState(x, 1);
check("bookmarking plays the effect over X's icon and hides X's own", st.host && st.hidden && st.id === "removeBookmark", JSON.stringify(st));
check("the effect sits exactly on X's icon", Math.abs(st.dx) < 0.6 && Math.abs(st.dy) < 0.6 && Math.abs(st.scale - 1) < 0.02, JSON.stringify(st));
await sleep(220);
st = await effectState(x, 1);
check("the liquid pours in", st.liquid, JSON.stringify(st));
await sleep(260);
st = await effectState(x, 1);
check("three sparks fly out after the fill", st.sparks === 3, JSON.stringify(st));
const fill = await x.eval(`document.querySelector(${JSON.stringify(HOST(1))}).shadowRoot.querySelector("path[fill-rule]").getAttribute("fill")`);
check("the effect is drawn in the bookmarked blue while X's own icon is still grey", fill === "rgb(29, 155, 240)", fill);
await settled(x, 1);
st = await effectState(x, 1);
check("afterwards X's own icon is back, its style untouched", !st.hidden && !st.host && st.svgStyle === null, JSON.stringify(st));

await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "bookmark"`);
st = await effectState(x, 1);
check("removing a bookmark plays the drain", st.host && st.hidden, JSON.stringify(st));
await settled(x, 1);

await x.eval(`rerender(2)`);
st = await effectState(x, 2);
check("a switch X makes by itself, with no click, plays nothing", !st.host && !st.hidden, JSON.stringify(st));
await x.eval(`rerender(2)`);

await x.eval(`document.querySelectorAll("article")[1].focus()`);
await x.key("b", "KeyB");
await x.until(`document.querySelector(${JSON.stringify(BTN(2))}).dataset.testid === "removeBookmark"`);
st = await effectState(x, 2);
check("pressing B on a focused post plays the effect", st.host, JSON.stringify(st));
await settled(x, 2);

await x.eval(`(() => { const ta = document.getElementById("ta"); ta.focus(); })()`);
await x.key("b", "KeyB");
await sleep(300);
st = await effectState(x, 2);
check("typing B in a text box plays nothing", !st.host && st.id === "removeBookmark", JSON.stringify(st));
await x.eval(`document.getElementById("ta").blur(); document.getElementById("ta").value = ""`);

// A slow server: the switch still counts as yours a couple of seconds after the click.
await x.eval(`window.serverMs = 1500`);
await x.click(BTN(2));
await x.until(`document.querySelector(${JSON.stringify(BTN(2))}).dataset.testid === "bookmark"`, 3000);
st = await effectState(x, 2);
check("a slow server answer still plays the effect", st.host, JSON.stringify(st));
await x.eval(`window.serverMs = 120`);
await settled(x, 2);

// Reduced motion: X's own swap.
await x.media([{ name: "prefers-reduced-motion", value: "reduce" }]);
await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "removeBookmark"`);
st = await effectState(x, 1);
check("with reduced motion X's own swap shows", !st.host && !st.hidden, JSON.stringify(st));
await x.media([]);
await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "bookmark" && !document.querySelector(${JSON.stringify(HOST(1))})`, 6000);

// The options page switches the effect in every x.com tab.
const opt = await openPage();
await opt.goto(`chrome-extension://${extId}/options.html`);
await opt.until(`document.documentElement.dataset.ready === "1"`).catch(async (e) => {
  console.error(await opt.eval(`({ href: location.href, title: document.title, body: document.body?.innerText.slice(0, 200) })`));
  throw e;
});
await opt.eval(`document.getElementById("onRemove").click()`);
await sleep(150);
await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "removeBookmark"`);
st = await effectState(x, 1);
check("with removal switched off, bookmarking still plays", st.host, JSON.stringify(st));
await settled(x, 1);
await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "bookmark"`);
st = await effectState(x, 1);
check("with removal switched off, removing shows X's own swap", !st.host && !st.hidden, JSON.stringify(st));

await opt.eval(`document.getElementById("enabled").click()`);
await sleep(150);
await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "removeBookmark"`);
st = await effectState(x, 1);
check("switched off: X's own swap shows", !st.host && !st.hidden, JSON.stringify(st));
await x.click(BTN(1));
await x.until(`document.querySelector(${JSON.stringify(BTN(1))}).dataset.testid === "bookmark"`);
const dimmed = await opt.eval(`document.getElementById("stage").classList.contains("is-off") && document.getElementById("onRemove").disabled`);
check("switched off: the preview greys out and the removal switch is disabled", dimmed);

const stored = await opt.eval(`chrome.storage.local.get("settings").then((b) => b.settings)`);
check("settings are saved in chrome.storage.local", stored?.enabled === false && stored?.onRemove === false, JSON.stringify(stored));

// Restore defaults, then Undo, then defaults again for the rest of the run.
await opt.eval(`document.getElementById("reset").click()`);
await opt.until(`!document.getElementById("undo").hidden && document.getElementById("enabled").checked && document.getElementById("onRemove").checked`);
await opt.eval(`document.getElementById("undo").click()`);
await opt.until(`document.getElementById("undo").hidden && !document.getElementById("enabled").checked`);
check("restore defaults and undo", true);
await opt.eval(`document.getElementById("reset").click()`);
await opt.until(`document.getElementById("enabled").checked`);

// The preview plays when clicked.
await opt.eval(`document.getElementById("previewButton").scrollIntoView({ block: "center" })`);
await opt.click("#previewButton");
await sleep(200);
const prev = await opt.eval(`({ pressed: document.getElementById("previewButton").getAttribute("aria-pressed"), liquid: [...document.querySelectorAll("#previewIcon path")].some((p) => p.getAttribute("clip-path") && p.getAttribute("display") !== "none") })`);
check("clicking the preview icon plays the effect", prev.pressed === "true" && prev.liquid, JSON.stringify(prev));
const steps = await opt.eval(`document.querySelectorAll("#steps li svg").length`);
check("the frame-by-frame strip shows six frames", steps === 6, String(steps));

// Language switch rewords the page.
await opt.eval(`document.querySelector('input[name="locale"][value="zh"]').click()`);
const zh = await opt.until(`document.documentElement.lang === "zh-CN" && document.querySelector("h2#effectTitle").textContent`);
check("switching to 中文 rewords the page", zh === "特效", zh);

if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
  for (const dark of [false, true]) {
    await opt.media([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
    for (const locale of ["zh", "en"]) {
      await opt.eval(`document.querySelector('input[name="locale"][value="${locale}"]').click()`);
      await sleep(150);
      for (const width of [1280, 375]) {
        const size = await opt.shot(join(SHOTS, `options-${dark ? "dark" : "light"}-${locale}-${width}.png`), width);
        check(`options ${dark ? "dark" : "light"} ${locale} ${width}px: no sideways scroll`, size.w <= size.vw, JSON.stringify(size));
      }
    }
  }
  console.log(`screenshots in ${SHOTS}`);
}

if (README) {
  mkdirSync(README, { recursive: true });
  // English images have no suffix; the Chinese README uses the "-zh" ones.
  for (const [locale, suffix] of [["en", ""], ["zh", "-zh"]]) {
    await opt.eval(`document.querySelector('input[name="locale"][value="${locale}"]').click()`);
    // The "Saved" toast from the language switch would sit in the picture.
    await opt.until(`!document.getElementById("toast").classList.contains("show")`, 4000);
    for (const dark of [false, true]) {
      await opt.media([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
      await sleep(200);
      await opt.shot(join(README, `options-${dark ? "dark" : "light"}${suffix}.png`), 1280);
    }
  }
  // The effect frame by frame: the settings page's strip, drawn by the same code as on x.com.
  await opt.eval(`document.querySelector('input[name="locale"][value="en"]').click()`);
  await opt.s("Emulation.setDeviceMetricsOverride", { width: 760, height: 800, deviceScaleFactor: 2, mobile: false });
  for (const dark of [false, true]) {
    await opt.media([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
    await sleep(200);
    const box = await opt.eval(`(() => { const r = document.getElementById("steps").getBoundingClientRect(); return { x: r.left - 8, y: r.top + scrollY - 8, width: r.width + 16, height: r.height + 16 }; })()`);
    await opt.shotClip(join(README, `frames-${dark ? "dark" : "light"}.png`), box, 1);
  }
  console.log(`README images in ${README}`);
}

ws.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
