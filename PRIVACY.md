# Privacy

Surprise Collection runs entirely in your browser. It has no server, sends no network requests, and collects no analytics.

## What it reads

- **Whether you clicked a bookmark button on x.com or twitter.com, or pressed <kbd>B</kbd> on a post.** It notes which button, for up to 5 seconds, so it can tell your bookmark apart from X re-drawing the page. It doesn't read which post it is.
- **The bookmark button's `data-testid`**, which X switches between `bookmark` and `removeBookmark`.
- **The icon's position, size and colour**, so the effect lands exactly on it in X's own colours.

It never reads your bookmarks, posts, messages, cookies or account, and it never clicks or sends anything for you.

## What it stores

One `settings` entry in `chrome.storage.local`, in this browser only:

| Field | Meaning |
| --- | --- |
| `enabled` | Play the effect when you bookmark |
| `onRemove` | Also play it when you remove a bookmark |
| `locale` | `en` or `zh`, the settings page language |
| `version` | Settings format version |

Removing the extension removes this entry.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save the settings above |
| Content scripts on `x.com`, `mobile.x.com`, `twitter.com`, `mobile.twitter.com` | Draw the effect on those sites. The extension doesn't run on any other site. |

It doesn't request `tabs`, `history`, `cookies`, any `<all_urls>` host access, or remote code.
