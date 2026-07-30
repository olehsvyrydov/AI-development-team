# Permissions and security

Load for: manifest permissions, `activeTab`, optional host permissions, CSP, handling credentials,
validating untrusted input, or preparing for store review.

## Contents

- [The permission model](#the-permission-model)
- [activeTab, precisely](#activetab-precisely)
- [Optional host permissions](#optional-host-permissions)
- [Content Security Policy](#content-security-policy)
- [Credentials](#credentials)
- [Untrusted input](#untrusted-input)
- [What store review actually rejects](#what-store-review-actually-rejects)
- [Review checklist](#review-checklist)

## The permission model

Three buckets in the manifest, with different costs:

```json
{
  "permissions": ["storage", "activeTab", "scripting", "tabs", "tabGroups"],
  "optional_permissions": ["downloads"],
  "host_permissions": ["https://api.example.com/*"],
  "optional_host_permissions": ["https://*/*", "http://*/*"]
}
```

- **`permissions`** are granted at install. Most are silent; a few (`tabs`, `history`, `bookmarks`)
  add a line to the install prompt.
- **`host_permissions`** are the expensive ones. `https://*/*` produces "Read and change all your data
  on all websites" — the single biggest cause of install abandonment and slow store review.
- **`optional_*`** are requested at runtime with `chrome.permissions.request`, from a user gesture.
  The prompt then arrives *when the user is asking for the thing that needs it*, which is both a
  better conversion and a better explanation.

**Default to optional host permissions.** Declare the narrowest static host permission you truly need
(usually just your own API) and request site access in context.

```js
// MUST be inside the click handler — not after an await, or the gesture is spent.
grantButton.addEventListener('click', () => {
  chrome.permissions.request({ origins: ['https://wiki.example.com/*'] }).then(handle);
}, { once: true });
```

Ask from a **real page**, not a popup: the permission prompt dismisses the popup, taking your code
with it.

## activeTab, precisely

`activeTab` is the cheapest useful permission — no install-time warning at all. Its rules:

- Granted when the user **invokes** the extension (toolbar click, context menu, keyboard command).
- Granted **for that tab only**.
- **Revoked when that tab navigates or closes** — not when it loses focus. So it survives the popup
  closing and another tab becoming active, which is what makes "start a job in a popup, run it on
  another page" work.
- It does **not** cover a tab your extension opened.

Design consequence: a job that reads the tab the user invoked you on can rely on `activeTab` and
should **not** prompt for anything. A job that opens its own tabs must hold a real host permission
for the origin, and should ask for it up front — the failure mode otherwise is every page silently
failing to extract.

For the `activeTab` case, prefer **attempt-then-gate**: run, and only if the injection is actually
refused (the grant lapsed because the tab navigated) show the prompt and retry. Gating up front for a
permission that is usually unnecessary is how people learn to click through prompts.

## Content Security Policy

MV3 forbids remotely hosted code, and the default extension CSP forbids `eval`. Practically:

- **Bundle everything.** No CDN scripts, no remote templates, no `import()` from a URL.
- **No `eval`, `new Function`, `setTimeout('string')`, or `javascript:` URLs.** Lint for all of them
  (`no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`) — the store rejects for them and a
  lint rule is cheaper than a rejection.
- **`innerHTML` is not CSP-blocked but is still the hazard.** Your extension pages are privileged;
  HTML built from page content is injection into that privilege. Use `textContent`. Inline SVG icons
  from trusted constants are fine; anything derived from a page is not.

## Credentials

- **`fetch` from an extension context sends cookies by default.** Against an API you also own, that
  means the browser's session cookie beats the API key you carefully attached — and the request
  succeeds as the wrong identity. Use `credentials: 'omit'` when the key *is* the identity.
- **A key in `storage.local` is not encrypted.** It is readable by anything with access to the profile
  directory. If you must store one, mitigate at the credential — least privilege, instantly
  revocable, attributable in an audit log — and say so in the README rather than implying the storage
  is safe.
- **Never log a key, and never put one in an error message.** Attach it in exactly one place.
- **Never put a secret in a URL.** Extension page URLs land in history and the omnibox. Pass job
  parameters through `chrome.storage.session` keyed by an id, not through a query string.

## Untrusted input

Everything from a page is untrusted, including messages your own content script sends — any site can
influence what that script sees.

```js
function asPayload(message) {
  if (message === null || typeof message !== 'object') return null;
  const { kind, data } = message;
  if (typeof kind !== 'string' || typeof data !== 'string' || data.length === 0) return null;
  if (kind !== 'image/png' && kind !== 'image/svg+xml') return null;
  return { kind, data };
}
```

Validate **before** the value reaches `atob`, `Blob`, `fetch`, `JSON.parse` on a size-unbounded
string, or a storage write. A missing field used to throw deep inside the handler, with nothing
catching it, so the user saw no error at all and the action simply never happened.

Also treat **stored** records as untrusted: storage survives extension updates, so a record written
by an older build can arrive with fields the current one does not expect. Validate on read and treat
a malformed record as absent.

If you fetch URLs the user supplies, you have an SSRF surface: refuse non-http(s) schemes, resolve and
reject private/link-local address ranges, cap redirects, and pin the resolved address across
keep-alive so a re-resolve cannot move the target.

## What store review actually rejects

- **Permissions without a stated purpose.** Every permission needs a justification in the listing.
  Broad host permissions need a very good one.
- **Remote code** of any kind, including a "config" that is really a script.
- **Undisclosed data collection.** If anything leaves the device, the privacy disclosure must say so,
  and it must match what the code does.
- **A single purpose that is not single.** An extension that collects pages *and* blocks ads is two
  extensions as far as review is concerned.
- **Obfuscated or minified-beyond-review code.** Minification is fine; obfuscation is not.

## Review checklist

- [ ] Every permission is justified in writing, and the narrowest that works.
- [ ] Host access is optional and requested in context wherever it can be.
- [ ] `chrome.permissions.request` is called from a gesture, on a real page.
- [ ] No `eval` / `new Function` / `javascript:` / page-derived `innerHTML`. Lint enforces it.
- [ ] Every runtime message is validated before use; so is every stored record on read.
- [ ] Credentials: attached in one place, `credentials: 'omit'` where the key is the identity, never
      logged, never in a URL.
- [ ] Nothing sensitive in an extension page's query string.
- [ ] The extension still behaves after the service worker is evicted.
- [ ] Every `chrome.*` call that can be refused is caught, and no refusal ends a job.
