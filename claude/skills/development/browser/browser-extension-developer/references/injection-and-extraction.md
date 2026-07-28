# Injection and extraction — getting into a page, and getting data back out

Load for: `chrome.scripting`, content scripts, reading page content, waiting for an SPA, or anything
where an injected script has to return a value.

## Contents

- [Declared vs. programmatic injection](#declared-vs-programmatic-injection)
- [The value problem, and the publish-and-poll contract](#the-value-problem-and-the-publish-and-poll-contract)
- [Progress from a script that runs for minutes](#progress-from-a-script-that-runs-for-minutes)
- [Isolated worlds](#isolated-worlds)
- [Waiting for an SPA to actually render](#waiting-for-an-spa-to-actually-render)
- [Extracting content worth storing](#extracting-content-worth-storing)
- [Size budgets](#size-budgets)
- [In-page overlays](#in-page-overlays)

## Declared vs. programmatic injection

`content_scripts` in the manifest run on every matching page forever, and the match patterns appear
in the install prompt. Programmatic injection via `chrome.scripting.executeScript` runs only when you
ask, needs the `scripting` permission plus access to that tab, and pairs naturally with
`optional_host_permissions`.

**Prefer programmatic** unless the extension genuinely must be present on every page load (a
persistent in-page UI, an early-document hook). It is a smaller install prompt, a smaller attack
surface, and it makes "when does this code run" answerable.

Two forms:

```js
// A bundled file. Cannot return a value — see below.
await chrome.scripting.executeScript({ target: { tabId }, files: ['content/read.js'] });

// An inline function. CAN return a value, but it is serialised to the caller, and it does not
// close over anything — every input must go through `args`, which must be structured-clonable.
const [{ result }] = await chrome.scripting.executeScript({
  target: { tabId },
  func: (selector) => document.querySelectorAll(selector).length,
  args: ['article'],
});
```

Use the inline form for small probes; use a file for anything with real logic, so it is typechecked
and linted with the rest of the codebase.

## The value problem, and the publish-and-poll contract

**A bundled content script cannot answer with its completion value.** Bundlers wrap each output file
in `(() => { … })()`, and the wrapper's value is `undefined` — so `executeScript({files})` hands back
`undefined` no matter what the source returns. This compiles, typechecks, passes every unit test, and
fails only in a real browser, where the caller reads "no result" and concludes the page had nothing.

The fix is a contract both sides share: the script **publishes** to a well-known global in the
isolated world, and the caller **polls** for it.

```ts
const RESULT_KEY = '__myextInjectedResult';

/** Every content script that returns data ends with this. */
export function publishResult(value: unknown): void {
  globalThis[RESULT_KEY] = { done: true, value };
}

export async function injectAndRead<T>(tabId: number, file: string,
                                       { timeoutMs = 180_000, shouldCancel } = {}): Promise<T | null> {
  // Clear first: a stale value from a previous run reads as this run's answer.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (key) => { delete window[key]; },
    args: [RESULT_KEY],
  });
  await chrome.scripting.executeScript({ target: { tabId }, files: [file] });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shouldCancel?.()) return null;
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId }, func: (key) => window[key], args: [RESULT_KEY],
    });
    if (probe?.result?.done) return probe.result.value ?? null;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}
```

Two things this buys beyond correctness:

- **The `done` flag distinguishes "no answer yet" from an answer of `null`.** Without it a script that
  legitimately found nothing is indistinguishable from one still working.
- **Polling removes any deadline on the script itself.** Expanding a large sidebar tree takes minutes;
  a single evaluation is not allowed to.

**Guard it in the build.** This is a property of the built artifact, invisible to source-level tests,
so assert it as a build postcondition — grep each bundled reader for the publish key and fail the
build if it is missing. See `build-and-test.md`.

## Progress from a script that runs for minutes

The caller is already polling. A **second** global carries progress, read in the same probe, so it
costs nothing:

```ts
const PROGRESS_KEY = '__myextInjectedProgress';
export function publishProgress(note: string, seen: number | null = null): void {
  globalThis[PROGRESS_KEY] = { note, seen };
}
```

The probe returns both, and the caller reports `note`/`seen` alongside elapsed-against-budget. This is
the difference between three silent minutes and a live count — and silence during a long operation is
indistinguishable from a hang.

## Isolated worlds

A content script shares the DOM and **nothing else**: not the page's globals, not its libraries, not
its `window` properties. Consequences:

- You cannot call the page's own functions. To reach them you must inject into `MAIN` world
  (`world: 'MAIN'`), which drops the isolation — do it only when you must, and never with data you
  did not construct.
- Globals you set are invisible to the page, which is what makes the publish key safe.
- The page cannot read your variables, but it **can** observe the DOM you touch. An overlay you inject
  is visible to the page's own scripts.

## Waiting for an SPA to actually render

`tab.status === 'complete'` fires when the document loads — long before a single-page app has
content. A presence-only check on `main, article` matches the app shell, so you capture whatever had
arrived by the first poll and store a partial page with no sign anything is missing.

Readiness that holds up:

1. Wait for `status === 'complete'`.
2. Poll the page for its **content root** and the length of its text.
3. Accept when the text passes a floor (a few hundred characters), **or** when a short body has
   **stopped growing** across consecutive polls — which lets a genuinely short page through without
   accepting a shell.
4. Bound the whole thing with a timeout that fails **one page, not the run**.

```ts
export class RenderReadiness {
  private lastLength = -1;
  private stable = 0;
  observe(probe?: { ready: boolean; length: number }): boolean {
    if (probe === undefined) return false;
    if (probe.ready) return true;
    this.stable = probe.length > 0 && probe.length === this.lastLength ? this.stable + 1 : 0;
    this.lastLength = probe.length;
    return this.stable >= 2;
  }
}
```

Report the growing length while you wait. Watching a body climb from 0 to 4 200 characters is what
tells a user the thing is working.

## Extracting content worth storing

- **Pick a content root** by an ordered selector list (`#main-content`, `[role="main"]`, `article`,
  `main`), most specific first, and reject known loading placeholders explicitly.
- **Clone before you mutate.** Never modify the live page to make extraction easier; the user is
  looking at it.
- **Inline assets you need** (images as `data:` URIs) with `credentials: 'include'` so
  session-protected images resolve — under a count cap *and* a time budget, because a page with two
  hundred images will otherwise hang the extraction.
- **Strip the furniture** — nav, headers, footers, comment widgets — but keep figures and tables;
  they are usually the point.

## Size budgets

Whatever you push to has a limit. Enforce it **before** the request, and report when you hit it:

1. Drop whole images, largest first, until the markup fits. Dropping half an image is a corrupt
   document.
2. If it still does not fit, fall back to text only.
3. **Say so.** A page stored without its images is still stored, and silence about that is what makes
   content loss invisible. Return a `truncated` flag and surface it — it is a modifier on the outcome,
   not a replacement for it.

Keep the image budget *below* the markup cap, allowing for base64's ~33% expansion, or figure-heavy
pages are truncated by construction.

## In-page overlays

For picking an element or showing a toast in context:

- Build it with `document.createElement` and `textContent`, never `innerHTML` with page-derived text.
- Give it a very high `z-index`, `position: fixed`, and `pointer-events: none` except where you need
  clicks.
- Attach listeners with `{ capture: true }` so the page cannot swallow them first, and remove
  everything when you are done.
- **Never trigger `alert`, `confirm` or `prompt`.** A modal dialog blocks the page's event loop, and
  with it every subsequent extension command to that tab.
