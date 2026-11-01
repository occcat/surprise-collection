# Architecture

How Surprise Collection plays a liquid-fill effect when you bookmark a post on x.com, and where each part lives. The effect recreates the one [@itsluneri showed](https://x.com/itsluneri/status/2116674589719675144).

## How X's bookmark button switches

Under every post, X draws a `<button data-testid="bookmark">` with an outline bookmark `<svg>` in it. When you click it, or press <kbd>B</kbd> on the focused post, X:

1. sends the bookmark to its server and shows "Added to your Bookmarks",
2. when the server answers, keeps the same `<button>`, changes its `data-testid` to `removeBookmark` and its `aria-label`, and replaces the `<svg>` with a filled one,
3. about a second later, removes the grey `color` from the inner `<div>`, so the icon fades to the bookmarked blue `rgb(29, 155, 240)` over 0.2 s.

Removing works the other way round: the `data-testid` goes back to `bookmark`, the outline icon comes back, and the grey returns at once.

The extension watches for step 2. It never clicks, sends or changes anything X needs.

## The effect

Every curve was measured frame by frame (60 fps) from [@itsluneri's video](https://x.com/itsluneri/status/2116674589719675144), at its normal-speed takes: the bookmark at 0.76 s and the removal at 2.67 s. The icon is 195 px wide there, about 12 px per icon unit, so the measurements are good to a tenth of a unit.

| Phase | Time (bookmarking, 820 ms) | What happens |
| --- | --- | --- |
| Stretch | 0–130 ms | The icon stretches 6 % taller and 3 % narrower. The outline turns from grey to blue by 68 ms. |
| Pour | 88–268 ms | Liquid falls in from the top with constant acceleration. Its edge is a halftone on 1.81-unit columns: tabs 1.57 long with thin slits between them, large dots (r 0.65) under the slits, small dots (r 0.38) under the tabs. |
| Squash | 150–300 ms | The icon squashes 13 % shorter, widening by half as much. A bulge up to 14 % wide forms at the top and runs down the icon. |
| Wobble | 300–620 ms | The icon rebounds 4 % taller, then settles |
| Sparks | 375–810 ms | As the bulge reaches the bottom, three sparks pop out at the bottom corners (at 45°) and under the notch (straight down). Each outer end shoots out 4.3–4.8 units and slows; the inner end follows later, so the spark stretches into a dash, thins from 1.95 to 1.35 units, and fades from 675 ms. |

Removing a bookmark (540 ms) stretches the icon 6 %, then squashes it 9 % with a bulge running from the bottom up while the liquid drains out, fast at first and slowing to a stop at 395 ms. The outline and the last dots fade to grey from 285 to 415 ms. It has no sparks.

## Parts

```
x.com tab
└── content.js  (ISOLATED world, document_start)
      click and B listeners · data-testid observer · the effect over the icon

options.html / options.js   settings page with a live preview, opened from the toolbar icon
background.js               opens the settings page when the icon is clicked
chrome.storage.local        { settings: { enabled, onRemove, locale, version } }
```

### `src/effect.ts`: the effect as numbers

`frameAt(kind, ms)` returns one frame: the colour's progress, where the liquid's edge is, how the icon is bent and where each spark is. `geometry(frame)` turns that into SVG path data:

- The icon's outer edge and the hole in the outline icon are sampled every 0.5 units, so they still look smooth once bent.
- The jelly is a `Shape`. `squash` lowers the top towards the bottom edge (negative stretches it) and widens the icon by half as much, so it keeps its volume. A bulge of height `bump` sits at `at`, a fraction of the icon's height, and falls off over `above` and `below`. The bottom edge never moves, so the sparks always leave from the same corners.
- The squash and bulge follow keyframes measured from the video, read with `track()`, a cubic Hermite spline through every key.
- The liquid is a block above its edge and the halftone below it: tabs, then large dots, then small dots. Everything is clipped to the hole grown by 0.25 units. The overlap hides the antialiasing seam two touching shapes of one colour would leave.
- The liquid's edge follows a parabola: constant acceleration when pouring, constant deceleration when draining.

Nothing here touches the DOM, so `node --test` covers it directly.

### `src/render.ts`: drawing a frame

`EffectView` holds one `<svg>` with the icon path (`fill-rule="evenodd"`, so outer edge plus hole is the outline), the liquid path with its `<clipPath>`, and three `<line>`s for the sparks. `draw(kind, ms, colors)` sets their attributes. All three share one colour, so the last of the liquid fades to grey with the outline when a bookmark is removed, as in the video. Every node is made with `createElementNS`. The viewBox is `-3 -3 30 32`, a 24-unit icon with room around it for the swell and the sparks.

### `src/content.ts`: playing it on x.com

- Capturing `click` and `keydown` listeners on `window` note which bookmark button you clicked, or which post had focus when you pressed <kbd>B</kbd>, and the icon's colour at that moment. <kbd>B</kbd> typed into an `<input>`, `<textarea>` or `contenteditable` element doesn't count.
- A `MutationObserver` watches `data-testid` across the document. A switch from `bookmark` to `removeBookmark` (or back) plays the effect only if it is the button you just used, within 5 seconds. Switches X makes by itself, such as re-renders, are left alone.
- The observer runs before the next paint. It hides X's `<svg>` with `visibility: hidden` and puts a `<surprise-collection-effect>` host with a shadow root next to it, sized to the icon and positioned by measuring the difference to X's icon. Each frame re-reads X's icon, because X may replace it or the page may scroll.
- The effect ends when its last frame is drawn *and* X's own icon shows the final colour, held for 4 frames. Without this, the icon would flash grey for about a second after bookmarking, while X waits to colour it. After 4 s the effect hands back regardless.
- When it ends, the host is removed and X's icon gets its `style` attribute back exactly as it was.
- The bookmarked colour comes from a bookmarked icon at rest on the page, never one that is still grey, falling back to `rgb(29, 155, 240)`. The idle colour comes from the reply icon in the same row.

Nothing plays when the effect is switched off, when **Also play it when you remove a bookmark** is off and you removed one, or when the system asks for reduced motion. X's own swap shows then.

Settings load asynchronously. Until they arrive, nothing plays, so a page loaded with the effect off never plays in its first moments.

### `src/options/`: the settings page

- `options.html` holds `{{key}}` placeholders. `build.mjs` fills them with the English strings so the page has text before its script runs. `data-i18n` and `data-i18n-label` attributes let the page re-word itself in the chosen language.
- The preview is an `EffectView` in a large button. Clicking it bookmarks or removes, and **Replay** plays bookmarking again. It always plays, even with the effect off or reduced motion on, because you asked for it.
- Under it, six still frames from `frameAt()` show the phases.
- `options.ts` saves each change to `chrome.storage.local` as soon as it happens and shows a toast. **Restore defaults** keeps the language and offers **Undo**. An `EchoGuard` drops storage events caused by this page's own writes, so a stale echo can't flip a switch back.
- `model.ts` holds the DOM-free parts (preview text, the frames to show, `EchoGuard`), which the unit tests cover.

Settings changes reach open x.com tabs through `chrome.storage.onChanged`, with no reload needed.

### `src/i18n.ts`: words

English and Simplified Chinese strings for the settings page. The language defaults to the browser's UI language and can be switched on the settings page. The extension's name and description in `chrome://extensions` come from `src/_locales/*/messages.json`.

## Build

`build.mjs` uses esbuild to bundle the three entry points (`content`, `background`, `options`) as IIFEs for Chrome 120. It then copies `manifest.json`, `options.css`, `icons/` and `_locales/` into `dist/` and writes `options.html` with the English strings filled in. `dist/` is the folder Chrome loads, and it is not committed.

`scripts/icons.py` draws `icons/*.png` with the Python standard library only: X's filled bookmark in its blue with the three sparks, on a dark rounded square.

## Tests

| Command | What it covers |
| --- | --- |
| `npm test` | `test/unit/`: the icon's shape at rest, start and end frames, the jelly matching the video's measured stretch, squash and rebound, the bulge's direction, the halftone's parts, the liquid accelerating in and decelerating out, the bottom edge staying put, sparks staying inside the viewBox, no `NaN` in any path, `track()`, colour parsing and mixing, settings, which effect plays for which switch, the preview text, both languages having the same keys |
| `npm run test:e2e` | `test/e2e/run.mjs`: loads `dist/` into headless Chrome for Testing and maps `x.com` to a local HTTPS page whose bookmark buttons switch the way X's do, colour delay included. It covers clicking and <kbd>B</kbd>, the overlay sitting exactly on X's icon, the liquid and sparks, X's icon coming back untouched, re-renders and typing playing nothing, a slow server, reduced motion, both switches, storage, restore and undo, the preview, and the language switch. |
| `npm run screenshots` | The same run, also writing the README images to `docs/screenshots/` |

The e2e run never reaches the real x.com.

Branded Google Chrome ignores `--load-extension`, so the e2e run uses Playwright's Chrome for Testing from `~/Library/Caches/ms-playwright`. Set `CHROME=/path/to/chrome` to use another build.

## When X changes

If the effect stops playing after an X update, check how the button switches now. In DevTools on x.com, select a bookmark button, then run:

```js
new MutationObserver((r) => console.log(r)).observe($0, { subtree: true, attributes: true, childList: true, attributeOldValue: true });
```

and click it:

- If `data-testid` no longer flips between `bookmark` and `removeBookmark`, update `ADD_ID`, `REMOVE_ID` and the observer in `content.ts`.
- If X replaces the whole `<button>` instead of keeping it, the observer needs to watch `childList` and match the new button to the one you clicked, for example through its `<article>`.
- If the icon is no longer an `<svg>` inside the button, `iconOf()` is the place to look.

Update the local page in `test/e2e/run.mjs` to switch the new way before you change the extension.
