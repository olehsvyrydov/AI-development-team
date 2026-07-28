# Building and testing an extension

Load for: setting up a bundler, deciding what to test and how, or wiring CI for an extension.

## Contents

- [The two bundle formats](#the-two-bundle-formats)
- [Build postconditions](#build-postconditions)
- [What to test, and what not to](#what-to-test-and-what-not-to)
- [Narrow interfaces beat a chrome stub](#narrow-interfaces-beat-a-chrome-stub)
- [Coverage as a ratchet](#coverage-as-a-ratchet)
- [Manual verification, which is not optional](#manual-verification-which-is-not-optional)
- [CI](#ci)
- [Packaging and release](#packaging-and-release)

## The two bundle formats

An extension has two populations of entry point and they need different output formats:

| Entry points | Format | Why |
|---|---|---|
| Service worker, popup, options, extension pages | **ESM** | Declared `"type": "module"` / `<script type="module">` |
| Content scripts | **IIFE**, one self-contained file each | They run in an isolated world where module loading is unavailable |

esbuild handles both in one script:

```js
const common = { bundle: true, sourcemap: false, target: 'chrome120', logLevel: 'info' };

await Promise.all([
  esbuild.build({ ...common, format: 'esm', outdir: 'dist', outbase: 'src',
    entryPoints: ['src/background/service-worker.ts', 'src/popup/popup.ts',
                  'src/options/options.ts', 'src/run/run.ts'] }),
  esbuild.build({ ...common, format: 'iife', outdir: 'dist/content',
    entryPoints: ['src/content/extract.ts', 'src/content/read-tree.ts'] }),
]);
await copyStatic();   // manifest, icons, html, css
```

`dist/` is what "Load unpacked" points at, and `dist/manifest.json` must be byte-identical to the
source manifest — copy it, never generate it, or the thing you tested is not the thing you ship.

Shared CSS (design tokens) is a static copy too, linked from each page ahead of that page's own
stylesheet.

## Build postconditions

Some defects are properties of the **built artifact**, invisible to source-level tests. Assert them
in a script the build runs after bundling.

The canonical one: every content script that answers the caller must contain the publish key. Drop
the publish and the source still compiles, typechecks, and passes every unit test — and hands back
`undefined` at runtime, so the caller concludes the page had nothing.

```js
const failures = [];
for (const file of MUST_PUBLISH) {
  const source = await readFile(file, 'utf8').catch(() => null);
  if (source === null) { failures.push(`${file}: missing from the build`); continue; }
  if (!source.includes(RESULT_KEY)) {
    failures.push(`${file}: never publishes to ${RESULT_KEY} — its answer cannot reach the caller`);
  }
}
if (failures.length > 0) { failures.forEach((f) => console.error(`  - ${f}`)); process.exit(1); }
```

Others worth adding as you meet them: a long-running reader that must publish progress; a manifest
whose `permissions` list has not silently grown; a content script that must not import from a module
entry point.

## What to test, and what not to

**Test heavily:** anything pure. Crawl planning, URL detection and normalisation, size budgets,
retry/pacing logic, the state reducer, ETA arithmetic, every user-facing string. This is where the
bugs that matter live, and none of it needs a browser.

**Do not test:** DOM assignment. If your view layer has been reduced to `el.textContent = …` and
`classList.toggle(…)`, a unit test there asserts that an assignment assigns. Push the *decisions*
(what the string says, which chip is active, what the title reads at 12/48) into a pure formatting
module and test that instead. Then the untested remainder is genuinely trivial — and the split is the
point, not a compromise.

**Skip jsdom** unless you have a real reason. It adds a dependency and an environment, and buys
coverage of code you have already made trivial. If you later want it, it is one devDependency plus a
per-file `// @vitest-environment jsdom` docblock — no config change. Record that as the escape hatch;
do not spend it in advance.

## Narrow interfaces beat a chrome stub

Do **not** monkeypatch `globalThis.chrome`. It is untyped, it leaks between test files, and — the real
objection — it lets code under test reach APIs the test never modelled, so a test can pass while the
code calls something that does not exist.

Instead, every module takes the narrow slice it needs:

```ts
export interface SessionStore {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface TabGroupApi {
  group(options: { tabIds: number[]; groupId?: number }): Promise<number>;
  update(groupId: number, props: { title?: string; color?: string }): Promise<unknown>;
}
```

Production composes them from `chrome.*` in one place; tests pass a `Map` and a recorder. The
interface is also documentation of exactly how much of the platform you depend on.

For a job driver, the same trick as one injected dependency object gets the whole driver under test —
including the paths that are otherwise unreachable, like "the working tab is closed mid-job" and
"every exit path closes it".

Injectable clocks matter too. A debounce, a retry wait and an ETA are all clock-dependent, and a test
that sleeps is a test nobody runs. Pass `now()` and a scheduler; drive them by hand.

## Coverage as a ratchet

Extensions have two populations: pure logic that should be near-fully covered, and DOM/`chrome.*`
surface that is not unit-testable. One number lets the well-tested half mask the rest.

Two tiers, and treat each threshold as **the level actually reached, rounded down** — raised
deliberately after the tests that earned it, never as an aspiration:

```ts
thresholds: {
  'src/lib/**/*.ts': { statements: 88, branches: 87, functions: 82, lines: 89 },
  statements: 39, branches: 40, functions: 39, lines: 39,
}
```

A useful side effect: putting a module in the covered directory *is* the assertion that it stays pure.
A driver that drifts back to calling `chrome.*` directly stops being testable, and the floor notices.

Move a module and its tests in the **same commit**, or the tier's percentage drops and the gate fires
on work that improved things.

## Manual verification, which is not optional

Unit tests cannot see the manifest, the bundler's wrapper, the permission prompt, the tab strip, or a
real SPA. Load `dist/` unpacked and walk the paths that only exist in a browser:

- The install prompt — is it what you meant to ask for?
- The permission gate on a fresh origin, for each access shape you support.
- The job end to end on real content, at real size.
- Every adversarial user action: close the working tab mid-job, drag it out of the group, ungroup,
  cancel, close the job tab, close the window.
- `chrome://extensions` → **Errors** afterwards. It collects what the worker threw while nobody was
  watching.
- Both colour schemes, and `prefers-reduced-motion`.

## CI

```yaml
- run: npm ci
- run: npm run typecheck     # tsc --noEmit
- run: npm run lint          # type-checked rules + the string-to-code bans
- run: npm run coverage      # unit tests + the ratcheted thresholds
- run: npm run build         # bundle + the build postconditions
```

Lint with type-aware rules and explicitly ban every string-to-code path (`no-eval`,
`no-implied-eval`, `no-new-func`, `no-script-url`) — the store rejects for them, and a lint rule is
cheaper than a rejection.

## Packaging and release

- Bump `version` in the manifest; it must be dotted integers, and it must increase.
- Zip the **contents** of `dist/`, not the directory.
- Keep a private `key.pem` if you need a stable extension id for local development.
- The store listing's permission justifications must match the manifest. When a permission is added,
  update the listing in the same change — a mismatch is a review rejection and a slow one.
