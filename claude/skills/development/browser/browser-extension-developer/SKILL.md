---
name: browser-extension-developer
description: "Browser Extension Developer (/ext) — Chrome/Edge Manifest V3 and Firefox WebExtensions: the service-worker lifecycle and what may not live in it, choosing between popup / options / side panel / extension page / in-page overlay / tab group, chrome.scripting injection and getting a value back out of it, tabs & tab groups, the permissions model (activeTab vs optional host permissions) and its revocation rules, long-running work that survives the popup closing, content-script security and CSP, and building/testing an extension without a browser in the loop. Use when building, reviewing, debugging or store-shipping any browser extension, or when a task involves a manifest.json with manifest_version. NOT for ordinary web-app UI (that's /fe) and NOT for browser automation with Playwright/Puppeteer (that's /e2e)."
---

# Browser Extension Developer (/ext)

**Command:** `/ext` · **Category:** Development · **Aliases:** `/chrome`

## Gate Check (workflow)

Consult the **`workflow-engine`** skill first.

- **A manifest permission change is an `ARCH_APPROVED` + `SECURITY_OK` trigger.** Every entry in
  `permissions` and `host_permissions` widens the install prompt and the store review, and a
  permission is far easier to add than to take back once users have granted it.
- **Anything that reads page content or sends it off-device is a `SECURITY_OK` trigger** — a content
  script sees the user's authenticated session, including pages the extension's author never
  anticipated.
- **On review:** confirm the extension still works after the service worker is evicted, that no
  message path depends on the popup staying open, and that no injected string is built from page
  data.

## When to use (and when not)

- **Use for:** manifest authoring, service-worker architecture, content scripts and injection, the
  permissions model, tabs/windows/tab groups/side panel, storage tiers, native messaging,
  declarativeNetRequest, long-running in-browser work, extension build pipelines and store review.
- **Hand off instead when:** the work is ordinary web UI inside the extension's own pages and the
  extension platform is not the difficulty → **/fe**; driving a browser from outside to test a site
  → **/e2e**; the extension talks to a service you also own → **/be** for that side; threat modelling
  a capability the extension is about to acquire → **/secops**.

## The MV3 mental model (read this before writing anything)

Four facts explain most MV3 bugs. Internalise them and the rest of the platform is ordinary
JavaScript.

1. **The service worker is not a background page.** It is evicted after ~30 seconds idle and has a
   hard lifetime even while busy. It has no DOM, no `window`, and no memory between wakes. Any
   variable you set in it is gone the next time it runs. **Never put a long-running job there.**
2. **Only a top-level listener registration survives eviction.** `chrome.tabs.onRemoved.addListener`
   at module scope wakes the worker when a tab closes. The same call made *inside* a message handler
   dies with the worker and silently never fires again. Everything the worker must remember between
   wakes belongs in `chrome.storage.session`.
3. **The popup is a page, and it closes.** Clicking anywhere outside it tears down its JavaScript and
   every port it opened. Work started in a popup dies with it; a message it sends while calling
   `window.close()` in the same breath is dropped if the worker was cold. Anything that takes longer
   than an instant belongs on a surface that outlives the click.
4. **A content script runs in an isolated world.** It shares the DOM with the page and shares nothing
   else — not `window` properties, not the page's own libraries. It also runs with the user's
   authenticated session, which is exactly why it is the security-sensitive part.

## Choosing the surface

| Surface | Lives as long as | Use it for | Do not use it for |
|---|---|---|---|
| **Popup** | The click. Closes on blur. | Picking options, arming an in-page interaction, starting work elsewhere. | Anything that takes seconds. |
| **Options page** | Its own tab. | Settings, credentials, permission requests that need a real page. | Per-task UI. |
| **Extension page (own tab)** | Until the user closes it. | **Owning a long run** — it *is* the job, and it has full DOM + APIs. | Anything the user should not have to keep open. |
| **Side panel** | The window. Survives tab switches. | An assistant-style companion to whatever tab is active. | State that must survive a window closing; it is per-window. |
| **In-page overlay** (injected) | The page. | Picking an element, highlighting, a toast in context. | Anything needing extension APIs directly. |
| **Tab group** | Its member tabs. | Making a multi-tab job *one visible object*, with a live title. | Load-bearing state — the user can dissolve it at any moment. |
| **Offscreen document** | Explicitly closed. | DOM APIs the worker lacks (parsing, clipboard, audio). | A general escape hatch from worker eviction. |

**The rule that follows:** the surface that OWNS a job must outlive the job. In practice that means
an extension page for anything long, and a popup that does nothing but start it.

## The ten things that bite

1. **A bundled content script cannot return a value.** Bundlers wrap output in `(() => {…})()`, whose
   completion value is `undefined`, so `executeScript({files})` hands back `undefined` no matter what
   the source returns. **Publish to a well-known global and poll for it** — which also removes any
   deadline on the script. See `references/injection-and-extraction.md`.
2. **`activeTab` covers one tab and is revoked on navigation.** It is granted when the user invokes
   the extension, for that tab, until it navigates or closes. It does *not* cover a background tab
   you opened, and it does *not* survive the tab navigating. A background tab needs a real host
   permission.
3. **`chrome.permissions.request` needs a user gesture** — call it inside the click handler, not
   after an `await`. And not from a popup that the prompt will dismiss; use a real page.
4. **A pinned tab cannot be in a tab group.** They are mutually exclusive; pick one anchor.
5. **`chrome.tabs.group` moves tabs** to make the group contiguous. Create tabs adjacent to where the
   group will be, or the user watches their tab strip rearrange.
6. **Tab-strip writes are refused while the user drags anything** ("Tabs cannot be edited right now").
   Catch every one, and debounce titles rather than writing per event.
7. **`fetch` from an extension context sends cookies by default.** Against your own API that means the
   browser's session beats the API key you attached. Use `credentials: 'omit'` when the key is the
   identity.
8. **Any page can send your worker a message.** Validate every field before it reaches `atob`, a
   `Blob`, or an API call. `sender.tab` and `sender.id` are the only things you did not get from the
   sender.
9. **`storage.sync` has small per-item and total quotas and write-rate limits**; `storage.local` is
   not encrypted; `storage.session` is cleared on browser restart and is the right home for
   short-lived cross-wake state. Pick deliberately.
10. **SPAs are "complete" long before they have content.** `tab.status === 'complete'` fires when the
    shell loads. Poll the page for real content and accept a short body only once it has stopped
    growing, or you will silently store empty shells.

## Deep-dive references (load on demand)

- `references/mv3-architecture.md` — worker lifecycle and eviction, what may live there, the storage
  tiers and their quotas, the popup/worker message race, alarms, offscreen documents, MV2→MV3
  migration.
- `references/surfaces-and-ui.md` — choosing and building each surface, real size constraints,
  theming without a toggle, and the accessibility rules that matter for a page that updates several
  times a second.
- `references/tabs-and-groups.md` — `chrome.tabs` / `chrome.tabGroups` / `chrome.windows` recipes:
  grouping, contiguity, drag-time refusals, debounced group titles, never stealing focus, and
  reaping tabs your extension orphaned.
- `references/injection-and-extraction.md` — `chrome.scripting`, the publish-and-poll contract,
  isolated worlds, waiting for an SPA to render, extracting page content, inlining assets, and size
  budgets.
- `references/permissions-and-security.md` — the permissions model end to end, `activeTab` semantics,
  optional host permissions, CSP, validating messages, handling credentials, and what store review
  actually rejects.
- `references/long-running-work.md` — who owns a long job, modelling its phases, pacing and rate
  limits, cancellation that actually cancels, honest progress and estimates, and keeping a long list
  rendering smoothly.
- `references/build-and-test.md` — bundling ES modules and IIFE content scripts together, build
  postconditions for properties unit tests cannot see, testing without a `chrome` stub, and CI.

## Standards

- **Every permission is justified in writing**, in the manifest's neighbourhood or the README. Prefer
  `optional_host_permissions` requested at the moment of need over broad grants at install.
- **Nothing long-running in the service worker.** If a job can outlast a wake, it belongs on a page.
- **No string-to-code, ever** — no `eval`, no `new Function`, no `javascript:` URLs, no `innerHTML`
  built from page data. Lint for it; the store rejects for it.
- **Every `chrome.*` call that can be refused is caught.** Tab-strip mutations, permission requests,
  and messages to a tab that has navigated all fail routinely and none of them should end a job.
- **Cosmetics are never load-bearing.** A failed group, badge or title must not stop the work.
- **A job says what it is doing.** Silence during a multi-minute operation is a defect, not a
  cosmetic gap — the user cannot tell it from a hang.
- **Test the pure logic, not the browser.** Take narrow interfaces for the `chrome.*` calls you use
  so tests substitute a recorder; never monkeypatch a global `chrome`.

## Anti-patterns to avoid

| Anti-pattern | Why it bites | Do instead |
|---|---|---|
| Long job in the service worker | Evicted mid-job, no error, no state | Own the job on an extension page |
| State in worker module scope | Gone on the next wake | `chrome.storage.session` |
| Listener registered inside a handler | Dies with the worker, never fires again | Register at top level |
| Popup does the work | Dies when the user clicks away | Popup starts, another surface runs |
| `window.close()` right after `sendMessage` | Cold worker never receives it | `await` the send, or do the work in the popup's own context |
| `executeScript({files})` and reading the return | Always `undefined` after bundling | Publish to a global, poll for it |
| Requesting all-hosts at install | Scary prompt, slower review, more to defend | `optional_host_permissions`, asked in context |
| `innerHTML` with page-derived text | Injection into your own privileged page | `textContent`, or a sanitiser you control |
| Trusting a runtime message | Any page can send one | Validate every field before use |
| Retrying a whole job because one item failed | One bad page loses two hundred good ones | Isolate per-item failures, report them, continue |
| Making a background tab active | Steals the browser from the user mid-task | `active: false`, always |
| A progress bar with no honest denominator | A guessed percentage that jumps backwards costs all trust | Show what you can count; say "elapsed of budget" when that is what it is |

## Universal work principles

- Read the platform's own error text before theorising; Chrome's extension errors are unusually
  precise ("Tabs cannot be edited right now", "Cannot access contents of the page").
- Load the unpacked build and *use it* before calling anything done. Unit tests cannot see the
  manifest, the bundler wrapper, the permission prompt, or the tab strip.
- `chrome://extensions` → **Errors** collects what the worker threw while nobody was watching; check
  it after every manual pass.
