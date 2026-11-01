- The default branch is `main`. Base branches on `main` and diff against `main` unless told otherwise.
- Edit sources under `src/`. `dist/` is build output: never edit it by hand and never commit it.
- Keep the extension's footprint as it is: only the `storage` permission, content scripts only on `x.com`, `mobile.x.com`, `twitter.com` and `mobile.twitter.com`, no network requests, no remote code. Get the user's agreement before widening any of these.
- Never click, submit or change anything on x.com for the user. The extension only draws over the bookmark icon while an effect plays, and puts X's icon back exactly as it was afterwards.
- Only play for switches the user caused: a click on the bookmark button, or <kbd>B</kbd> on the focused post. Switches X makes by itself, such as re-renders, stay as they are.
- On x.com, `prefers-reduced-motion: reduce` always means X's own icon swap.
- Every user-facing string exists in both `en` and `zh` in `src/i18n.ts`. Manifest strings go in `src/_locales/*/messages.json`.
- When X changes how its bookmark button switches, update the local page in `test/e2e/run.mjs` to switch the new way before changing the extension.

## Commits

Commit with a message that follows [Conventional Commits](https://www.conventionalcommits.org/), written in Chinese. Make it as detailed as possible and always multi-line, and include only a description of what changed and why.

```
<type>(<optional scope>): <中文摘要>

<中文正文：改了什么、为什么改>
```

- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- The subject is one imperative line with no trailing period.
- A blank line follows the subject, then a body of at least two lines. A subject-only commit is not allowed.
- Leave out process chatter, tool signatures, `Co-authored-by` lines for agents, secrets and machine-specific paths.
- Unrelated changes go in separate commits.

Example:

```
fix(content): X 重新渲染书签按钮时不再播放特效

X 刷新帖子数据时会自己把按钮在 bookmark 和 removeBookmark 之间切换，
扩展把这种切换也当成了用户收藏，凭空播放特效。现在只有用户点击按钮
或按 B 之后 5 秒内的切换才会播放，其他切换保持 X 原样。
```

## Style Guide

- TypeScript in strict mode. Avoid `any`.
- Keep DOM-free logic in its own modules (`src/effect.ts`, `src/settings.ts`, `src/options/model.ts`) so `node --test` can cover it without a browser.
- Build nodes with `textContent`, `createElement` or `createElementNS`, never `innerHTML`.
- Draw anything shown on x.com inside a shadow root so the site's CSS can't reach it.
- Treat values read from the page (computed colours, attributes) as untrusted. Colours go through `parseRgb()` before they are mixed.
- Write comments for non-obvious constraints and surprising behavior, not for obvious code.
- Don't add runtime dependencies. Dev dependencies stay limited to the build and type tooling.

## Testing

- Test the real implementation. Don't copy logic into tests.
- Unit tests live in `test/unit/` and run with `node --test`.
- The e2e run maps `x.com` to a local page. It must never reach the real x.com or anyone's account.

## Checks

Run these before committing. All must pass:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

After a change to the settings page or the effect, run `npm run screenshots` and commit the updated `docs/screenshots/`.
