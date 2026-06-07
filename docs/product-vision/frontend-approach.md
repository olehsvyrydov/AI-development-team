# Frontend Implementation Approach — ADT Constellation / Studio Cockpit

> **/fe (Finn) — Frontend implementation approach.** Plan/assessment only; no
> production code in this document.
> **Inputs:** `architecture.md` (Jorge), `ui-design.md` (Aura), `ba-requirements.md`
> (Anna), `strategy.md` (Apex), and the actual `hub/` source (read, not assumed).
> **Gate status:** This is input to implementation, not an approval. `ARCH_APPROVED`
> and `SECOPS_APPROVED` are still pending per the architecture doc; this FE plan
> assumes they land before code. `DESIGN_APPROVED` is soft — Aura's spec is draft.
> **Framework decision:** The frontend is **Angular 21** (owner-locked, see §0). This
> supersedes the earlier React/React-Flow lean; the rest of the approach — zero-dep hub
> as the floor, port the hub's framework-agnostic logic under test, one-codebase-three-
> hosts, phased delivery — is unchanged and re-expressed for Angular below.

---

## 0. TL;DR (decisions, up front)

1. **Framework: Angular 21 (latest) + TypeScript strict.** Standalone components,
   Signals, **zoneless** change detection, **Signal Forms**, built with the Angular CLI
   (Vite/esbuild under the hood). Move off the single vanilla `index.html`, but **keep
   that file alive and shipping** as the zero-dep fallback MVP (the "browser MVP") served
   at `/legacy` until the Angular shell reaches parity on the Tasks board. Angular is the
   owner's locked choice for **stack consistency with the KGB project** (also Angular —
   the owner will align KGB to the same version), shared components/tooling, and a
   realtime-friendly model.
2. **Visual workflow builder: Rete.js v2** with its **official Angular renderer**.
   Chosen over ngx-vflow and @foblex/flow because the workflow is **a program that
   executes**, and Rete is the one option purpose-built for node graphs that execute
   (dataflow/control-flow/hybrid engines), not only render. Full rationale in §2.
   Lazy-loaded on the Workflow route only.
3. **One codebase, three hosts** via a thin `PlatformBridge` service (transport +
   capabilities). The same Angular bundle is served by Constellation Core over HTTP/SSE
   and loaded in (a) Tauri WebView, (b) a plain browser, (c) an IDE webview. Hosts differ
   only behind the bridge: file-picker, secure storage, base URL/auth. **Angular runs
   fine in a system WebView; there is no Node in the webview** — anything native goes
   through the bridge.
4. **Realtime: reuse the hub's SSE (`/api/events`)** as-is via **RxJS**; add **per-project
   multiplexing**. No WebSockets for MVP. Writes go through the existing POST API with the
   `X-AIDT` CSRF header and the **CAS `expectedRev` 409 reconcile** loop already
   implemented server-side.
5. **State: lean, Signals-first.** Angular **Signals + injectable services** for client
   state; RxJS only at the transport edge (SSE) and bridged to Signals via `toSignal`. No
   global store framework unless justified — **NgRx SignalStore is held in reserve** for
   the one or two genuinely complex slices (run-trace, multi-project registry), and only
   if plain signal services prove insufficient.
6. **Reuse the hub UI logic verbatim** — the status-derivation, gate-chip, agent-badge,
   comment-timeline, and SSE diff→toast logic in `index.html` is **plain TypeScript** and
   ports into Angular services + standalone components under **snapshot tests**. This is
   the single biggest de-risking lever: the hard, already-correct presentation logic
   (status derivation, blocked-by-hard-gate rule, relative time, gate-state glyphs) is
   ported, not reinvented.
7. **Phased delivery** keeps the zero-dep hub as the floor and — per the owner's
   sequencing decision — builds the **multi-project shell FIRST**, then Tasks, Base,
   Workflow (read/edit), live-run, and the Conveyor view.

---

## 1. The central tension — vanilla vs. a framework

### 1.1 What we have today (verified against source)

`hub/public/index.html` is **612 lines**: one `<style>` block (the full dark theme + all
state/stage tokens) and one `<script>` of dependency-free vanilla JS. It already
implements, correctly, the things that are *hard to get right* (verified function names
in source):

- **Status derivation** (`derivedStatus`, `blockingGate`) — a ticket is "blocked" only
  by a **rejected hard gate**; soft-gate rejection does not block. This mirrors the
  server's canonical derivation and must not regress.
- **Gate chips** (`renderGateChip`, `chipState`) with `passed/pending/rejected/na`
  states, `hard`/`soft` modifier (solid vs dashed left border), and a safety glyph.
- **AgentBadge** (`renderAgent`) with assigned vs expected-owner (dashed, muted) variants.
- **Comment timeline** (newest-first, attributed, kind-tagged, `slidein` animation).
- A complete **SSE client** (`EventSource('/api/events')`) with auto-reconnect, a **diff
  engine** (`snapshot` → `diffToasts`) that emits toasts on stage/assignee/comment/gate
  transitions, and card-flash on change.
- A **focus-trapped, Esc-closable modal** with `aria-modal`.
- Full **`prefers-reduced-motion`** handling and color-never-alone status labels.

This is roughly **80% of the Tasks view already written** — just not componentized or
typed, and single-project only. **None of this logic is React- or Angular-specific** —
it is pure DOM + plain functions, so the framework move is a re-host of TypeScript, not a
rewrite of behavior.

### 1.2 Why vanilla cannot carry the new vision

The vision adds three things vanilla makes painful:

- **The Workflow builder** needs nodes/edges/pan/zoom/minimap/keyboard-connect **and an
  execution model** (the graph runs real agents). Hand-rolling this in vanilla is months
  of work; a node-graph library gives it for free.
- **Multi-project shell** (rail + Overview + project switching with per-project preserved
  state) is a real component tree with routing and shared state — exactly what a framework
  manages and vanilla string-templating does not.
- **Live-run trace** (token animating along edges, active-node halo, streaming inspector)
  is stateful, per-frame, and tied to realtime events — manageable with Angular Signals +
  RAF, miserable in ad-hoc vanilla.

### 1.3 Decision: Angular 21 — with the vanilla hub as the floor

The framework is **Angular 21**, locked by the Product Owner. The rationale is
organizational as well as technical:

| Driver | Why Angular 21 |
|---|---|
| **Stack consistency (KGB)** | The KGB project is Angular; the owner will align KGB to this same version. One framework, one toolchain, one set of conventions across both products. |
| **Shared components/tooling** | Components (status chips, badges, timeline, the canvas shell) and CLI/test config can be shared or lifted between Constellation and KGB. |
| **Realtime-friendly** | Signals + zoneless + RxJS-at-the-edge is a clean model for a live-mirroring, SSE-fed cockpit — fine-grained reactive updates without zone churn. |
| **Modern baseline** | v21 ships standalone-by-default, zoneless-by-default, Signal Forms, and a first-party Angular renderer exists for the chosen canvas library (Rete.js v2). |

| Option | Verdict | Why |
|---|---|---|
| **Keep vanilla** | No (for the rich shell) | Cannot host a node-graph editor; multi-project + live-run are too stateful |
| **Angular 21** | **Chosen (owner-locked)** | KGB stack consistency, shared components, Signals/zoneless realtime model, mature CLI/Vite build, official Angular canvas renderer |
| React + React Flow | Superseded | Was the earlier lean (React Flow forced React); the owner's KGB-consistency decision overrides it |
| Vue / Svelte / Solid | No | No KGB alignment; orphans the shared-component goal |

**TypeScript strict** (skill standard: no `any`, explicit public return types).

### 1.4 Angular 21 baseline (concretely)

- **Standalone components** everywhere (no NgModules). `OnPush` is moot under zoneless,
  but components are written signal-first so change detection is driven by signal reads.
- **Zoneless change detection** (default in v21) — `zone.js` removed from polyfills. All
  reactivity flows through Signals; async edges (SSE, HTTP) are bridged with `toSignal`.
- **Signals + `computed` + `effect`** for derived state and side effects; `linkedSignal`
  for "selection that follows a list" cases (e.g. selected node follows the graph).
- **Signal Forms** (v21) for the Base doc editor, node inspector, and connect/settings
  forms — typed, signal-driven validation, no `FormGroup` boilerplate.
- **Angular Router** with **lazy-loaded feature routes** — Workflow (and its canvas
  library) is its own async chunk so Tasks/Base/Overview never pay for it.
- **`@angular/aria`** (developer preview) for the dialog/menu primitives where it's stable
  enough; otherwise hand-rolled accessible components matching the hub's existing a11y.

**Project structure (multi-panel app):**

```
src/app/
├── core/                     # singletons: PlatformBridge, EventStream, HttpAuth, registry
│   ├── platform/             #   bridge interface + tauri/browser/ide impls
│   ├── realtime/             #   SSE service, per-project multiplexer, diff engine
│   └── ledger/               #   status/derive/time (ported hub logic), CAS-409 client
├── shared/                   # reusable standalone components from the hub canon
│   ├── status-label/  agent-badge/  gate-chip/  recall-chip/
│   ├── comment-entry/ toast-rail/   live-dot/   dialog/
├── features/
│   ├── projects-home/        # launcher: grid, connect→analyse pipeline, empty state
│   ├── project-shell/        # header + left rail + Overview, routes to the 3 panels
│   ├── tasks/                # board, conveyor, ticket timeline, archive
│   ├── base/                 # doc list, editor (Signal Forms), recall indicators
│   └── workflow/             # LAZY: canvas, node components, inspector, run-trace
├── app.config.ts             # zoneless providers, router, http
├── app.routes.ts
└── main.ts                   # bootstrapApplication (no zone.js)
```

- **Build:** **Angular CLI** with the esbuild/Vite-based application builder (default in
  modern Angular) — fast HMR, no hand-written bundler config.
- **Bundle budget.** A dashboard in a desktop shell loads from loopback, but we keep it
  lean for the browser/IDE-webview paths. Targets (gzip), enforced as CLI `budgets`:
  - **Initial route (Projects Home + Shell + Tasks): < 250 KB gzip** (Angular runtime is
    heavier than React's, so the floor is higher; zoneless + standalone + tree-shaking
    keep it controlled).
  - **Workflow route is a separate lazy chunk** — the canvas library (Rete.js v2 + its
    Angular renderer) and the run-trace machinery never load until the user opens Workflow.
  - **Styling = CSS custom properties** (the lifted hub token set) — no utility-CSS
    framework, no CSS-in-JS runtime. The hub already proves zero-dep theming; Aura's
    additive tokens append to it.

### 1.5 Migration path that preserves the working hub board

The port is **mechanical, not a redesign** — same logic, typed and re-hosted in Angular:

| Hub logic (vanilla) | Becomes (Angular/TS) | Notes |
|---|---|---|
| `relTime`, `derivedStatus`, `blockingGate`, `chipState` | pure functions in `core/ledger/` | **Snapshot-test against the vanilla output** so the hard-gate rule can't drift — these are framework-agnostic and port verbatim |
| status/gate/stage token maps + `stagePillStyle` | `core/ledger/tokens.ts` + CSS custom props | copy-paste-port; unit-test parity |
| `renderAgent` | `<agent-badge [ticket] [owners]>` standalone component | assigned vs expected variants |
| `renderGateChip` / gate row | `<gate-chip>` / `<gate-row>` | |
| `renderCard` | `<ticket-card>` | |
| `renderModal` + focus trap + `onModalKey` | `<app-dialog>` primitive (or `<dialog>` + CDK trap) | keep the focus trap + Esc |
| `snapshot` / `diffToasts` / `toast` | `RealtimeDiffService` + `<toast-rail>` | the diff engine is reusable as-is, keyed by ticket id |
| `EventSource('/api/events')` + reconnect | `EventStreamService` (RxJS Observable per project) → `toSignal` | add project scoping |
| the `<style>` block | `theme.css` (CSS custom properties) | **lifted verbatim**; Aura's additive tokens appended |

**Test strategy for the port (TDD, per skill):** before porting each pure function, write
a unit test (Vitest via `@analogjs/vite-plugin-angular`, the Angular-21 default) that
asserts the *current* vanilla output for a fixed ticket fixture, then port until green.
This guarantees the board's correctness survives the framework move — the highest-risk
regression (the blocked-by-hard-gate rule) is locked by a test. The pure functions carry
**zero framework coupling**, so the React→Angular reframing does not touch them at all;
only their call sites (components) change.

---

## 2. The Workflow builder (canvas library decision)

The Workflow panel is the headline. It must (a) render a node graph (trigger/agent/
conditional/loop/background/merge), (b) let the user inspect/edit nodes, (c) validate
against `workflow.yaml`, and (d) **visualize a live run** (token along edges + active-node
halo) driven by realtime events. Crucially, **the graph is a program that executes real
agents** — not a static diagram.

### 2.1 Candidates evaluated

| Library | Model | Angular support | Execution model | License |
|---|---|---|---|---|
| **Rete.js v2** | Framework-agnostic core + per-framework renderers | **Official Angular renderer** (standalone from v19; enhanced for v20/21; Angular 12–21) | **Built-in dataflow / control-flow / hybrid / codegen engines** — purpose-built for graphs that *execute* | MIT |
| **ngx-vflow** | Angular-native, **Signals-based**, React-Flow-like | Native (Angular 16+) | **Rendering only** — no execution engine (virtualization, minimap, keyboard, subflows) | MIT |
| **@foblex/flow** | Angular-native, signals + standalone, SSR-aware | Native (targets Angular 17.3+) | **Rendering only** — Dagre/ELK auto-layout, waypoints, minimap | MIT |

### 2.2 Recommendation: **Rete.js v2** (with the official Angular renderer)

**Rationale — it fits "a visual program that executes," which is exactly what this is.**

- **The workflow EXECUTES.** Architecture §6 / VISION L3 are explicit: the graph
  *compiles to* an execution plan that drives real agents through gates. Rete.js is the
  only candidate whose core is built around **processing engines** (dataflow, control-flow,
  hybrid, codegen) — it models nodes-that-compute, not just nodes-that-draw. Our Core
  remains the authoritative compiler/runtime (it owns gates/ledger), but Rete's mental
  model and data structures align with "this graph is a program," reducing the
  impedance mismatch between editor and runtime. ngx-vflow and @foblex/flow are
  presentation libraries — we'd hand-build the execution/semantics layer entirely on top.
- **First-party Angular renderer, current.** Rete's Angular plugin officially supports
  Angular **12–21**, with **standalone** mode from v19 and enhanced support for v20/21 —
  so it tracks our v21 baseline rather than being a wrapper or a community port.
- **Framework-agnostic core = shared with KGB.** Because Rete's core is framework-neutral
  and its renderers are swappable, the graph/runtime model can be shared with the
  KGB project even if a panel there renders differently — supporting the owner's
  shared-tooling goal.
- **MIT**, mature, plugin-based (area/zoom, connection, minimap, arrange, history,
  context-menu plugins exist) — we compose only what we need and lazy-load it.

**Trade-offs we accept (and mitigate):**

- The Angular renderer uses **`@angular/elements` (Web Components)**, which **cannot be
  unregistered** — risking component-state reuse across re-mounts. *Mitigation:* keep node
  components stateless w.r.t. the element registry (state lives in Signals/services keyed
  by node id), mount the editor once per Workflow-route activation, and verify
  mount/unmount cycles in a Playwright test early.
- Rete is **lower-level than ngx-vflow's signal-native ergonomics** — more wiring to get a
  polished editor. *Accepted* because the execution-model fit is the dominant requirement,
  and the extra control helps the bespoke run-trace overlay.
- **WKWebView performance** for transform-heavy animation (the live token, 50+ nodes) is a
  risk for *any* canvas lib. *Mitigation:* §2.6 (GPU-friendly `transform`/`opacity` only;
  spike a 50-node canvas on WKWebView before committing to animation richness).

**If Rete's ergonomics prove too costly during the Workflow phase**, the fallback is
**ngx-vflow** (signals-native, least friction with our zoneless model) — we'd then build
the execution-semantics layer ourselves against Core. This is a contained, phase-4
decision; nothing before Workflow depends on the canvas lib.

### 2.3 Library & integration

- **Data model** is Jorge's `workflow.graph.json` (nodes/edges, per project, in
  `.aidevteam/`). The FE maps Rete `Node`/`Connection` objects ↔ the persisted graph
  schema. **The graph file is the source of truth; the editor is the view.** Round-trip
  must be lossless — a serialize/parse property test enforces it (K4).
- The editor is **lazy-loaded** on `/project/:id/workflow` so other routes never pay the
  bundle.

### 2.4 Node types (custom Rete node components)

One custom Angular node component per Jorge/Aura taxonomy, all styled from the existing
stage-hue tokens so a given agent looks the same hue everywhere:

| Node | Glyph | Component | Inspector fields |
|---|---|---|---|
| Trigger | ⚡ | `TriggerNode` | event/stage/cron/file-change/manual |
| Agent | ◆ | `AgentNode` | agent (`/role` select), mode (fg/bg), instructions, outputs, on-error |
| Conditional | ◇ | `ConditionalNode` | expression over gate/ledger state; yes/no/case ports |
| Loop | ↺ | rendered as a routed **dashed connection** back to an earlier node | `maxIters`, exit condition |
| Gate | (barrier) | `GateNode` | maps to a `workflow.yaml` gate name (validated) |
| Background | ☾ | `BackgroundAgentNode` (dashed border, bottom lane) | trigger condition |
| Merge | ⏚ | `MergeNode` | — |

**Inspector** (`<node-inspector>` / `<edge-inspector>`): a contextual right panel built
with **Signal Forms** that swaps between node config and edge config (condition expression
+ label). Below `lg` it becomes a slide-over sheet (Aura §10).

### 2.5 Validation against `workflow.yaml`

The builder earns trust here. The FE runs **client-side validation for fast feedback**,
but the **Core compiler is authoritative** (Jorge §6):

- A node cannot claim a gate that doesn't exist in `workflow.yaml` → agent/gate selects
  are populated from the project's gate defs exposed by Core.
- **`safety_override` gates cannot be bypassed** — the editor refuses to delete/skip them
  and marks them visually locked.
- **Loops must be bounded** (`maxIters`) and have a reachable exit — the editor warns on
  an unreachable-exit loop *before save*.
- **Dangling references** (deleting a loop target) are flagged before save.
- On save, the FE POSTs the graph; **Core compiles + validates** and returns errors the
  editor surfaces inline (never silently drop steps).

### 2.6 Live run visualization (the headline)

Driven entirely by **realtime events** from Core (SSE), not client guessing:

- **Token** = a glowing accent dot animated along the active connection using an SVG
  `<animateMotion>` or a RAF-driven `transform` on an overlay positioned from the
  connection path. Capped ~400ms, edge-length-scaled (Aura §11).
- **Active node** = accent halo + slow pulse (reuse the hub's `live` pulse keyframe) +
  `◉ ACTIVE` badge. Done = green check + 70% opacity. Pending = 38% dim. Failed = red ring.
- **Run log** replaces the palette during a run; clicking a row recenters the canvas.
- **Active-node inspector** streams the agent's live output (an SSE-fed text buffer, held
  in a Signal) and offers **Pause here** (soft breakpoint).
- **Run state machine:** `idle → running ↔ paused → done | failed | stopped` (Aura §4.3).
  Modeled as a small signal-based service (promote to NgRx SignalStore only if it grows).

**WCAG dragging-alternative (2.5.7) — mandatory (skill + Aura §9):**
- Node creation: palette **click-to-insert-after-selected**, not only drag.
- Connections: **keyboard port-connect** (focus a port → Enter → arrow to target →
  Enter). We wire custom keyboard handlers into Rete's interaction layer — don't assume
  the library does it for us.
- An **accessible list view** of the graph ("/be → /rev (on done); /rev → /be (loop)") as
  an `aria` alternative to the spatial canvas (Aura §9).
- Run state announced via `aria-live="polite"`.
- All interactive targets ≥24px (≥44px on coarse pointers).

### 2.7 Effort & risks

- **Effort:** Builder (edit) ≈ the largest single FE chunk — custom Angular nodes,
  inspector (Signal Forms), validation, autosave, lossless round-trip. Live-run trace ≈
  another sizeable chunk (animation + run-state wiring + a11y list view).
- **Risks:** (a) Rete `@angular/elements` re-mount/state-reuse — mount once per route,
  test mount/unmount early; (b) WKWebView transform performance — spike early; (c)
  keyboard-connect a11y is fiddly — budget time, ship the list-view alternative
  regardless; (d) lossless round-trip — lock with a property test.

---

## 3. Realtime + state

### 3.1 Transport: reuse SSE via RxJS, skip WS for MVP

The hub already ships a working `GET /api/events` SSE stream with `update` events and
client auto-reconnect. **Reuse it**, wrapped as an RxJS `Observable` and bridged to
Signals via `toSignal`. Decision: **no WebSockets for MVP** —

- SSE is one-directional server→client, exactly the mirroring need; writes go over POST.
  This matches the hub's proven model and avoids a second transport.
- The optional WS is deferred; SSE can already stream incremental text (the live-run
  inspector buffer), so the bar for WS is high.

`EventStreamService` exposes the stream as an Observable so RxJS operators
(`retryWhen`/backoff for reconnect, `scan` for the diff fold, `filter` per project) do the
transport-edge work; components consume **Signals**, not raw Observables.

### 3.2 Multi-project subscription

The hub SSE is single-project. For N projects ("see which project changed even when not
viewing it"):

- **Option A (chosen for MVP):** one SSE connection per connected project, each scoped by
  `projectId`, multiplexed in an `EventStreamService` keyed by project id. Simple, isolates
  failures (one stale project doesn't kill others).
- **Option B (later):** a single multiplexed Core stream emitting `{ projectId, update }`
  envelopes. Cleaner at scale, but a Core change. Defer until project counts justify it.

Per-project live badges on the rail/cards consume the stream even when that project isn't
the active view — the diff engine computes "what changed," we route the badge update to a
per-project signal.

### 3.3 Client state management (lean, Signals-first)

| Concern | Tool | Why |
|---|---|---|
| Server data (board, tickets, comments, base docs, graph) | **Signal-based resource services** (`HttpClient` → signal; SSE events patch the signal) | no React-Query equivalent needed; the hub's diff engine tells us precisely which tickets changed → targeted signal updates |
| Active project, canvas selection, run-trace overlay, view toggles | **Signals in injectable services** | tiny, no boilerplate, no store framework |
| Workflow graph editor state | local component signals + an editor service | debounced autosave to `workflow.graph.json` |
| Auth token / secrets | the platform bridge (keychain or in-memory) | never in app state, never persisted to web storage |

**NgRx SignalStore only if justified.** Plain signal services cover the MVP. We reach for
**SignalStore** only where a slice has genuinely complex, multi-source transitions —
realistically just the **live-run trace** (run state machine + per-node status + streaming
inspector) and possibly the **multi-project registry**. Keep it lean; do not adopt a store
framework app-wide by reflex.

### 3.4 Optimistic writes + CAS 409 reconcile (already half-built server-side)

`api.js` implements **atomic CAS** via `readModifyWriteLedger(project, expectedRev, …)`
and returns **`{ code: 409, conflict: true, state }`** on a stale write. The FE contract:

1. Every mutation (advance/assign/gate/comment) sends the current `expectedRev`.
2. **Optimistic update** to the relevant signal for snappy UI.
3. On **409**: the server returns the fresh `state` — **reconcile** by replacing the
   signal with that state, re-deriving status (via the ported pure functions), and (if the
   user's intent still applies) retrying once against the new rev; otherwise surface a
   non-destructive "someone changed this — re-applied latest" toast. The server hands back
   the truth, so the FE invents no conflict logic.
4. All writes carry the **`X-AIDT`** header (CSRF guard) + a bearer token when remote.

---

## 4. One codebase, three hosts

The UI is **plain web served over HTTP/SSE** (exactly as the hub does today, per Jorge §3
"Browser + remote fallback"). **All three hosts load the same Angular bundle from the same
Core**; only a thin bridge differs.

```
            ┌────────────────────────── same Angular bundle ──────────────────────────┐
            │   Angular app  ·  PlatformBridge (transport + capabilities interface)    │
            └───────────────┬───────────────────┬───────────────────┬─────────────────┘
                            │                   │                   │
                ┌───────────▼──────┐ ┌──────────▼────────┐ ┌────────▼─────────────┐
                │ TauriBridge      │ │ BrowserBridge     │ │ IdeWebviewBridge     │
                │ (desktop)        │ │ (local / remote)  │ │ (Kiro/VS Code/Cursor)│
                └───────────┬──────┘ └──────────┬────────┘ └────────┬─────────────┘
                            └──────────── HTTP + SSE on 127.0.0.1 ───┘  → Constellation Core
```

### 4.1 The `PlatformBridge` service (what differs)

A single injectable interface, three implementations, chosen once at boot by host
detection (`window.__TAURI__`, `acquireVsCodeApi`, else browser):

| Capability | Tauri WebView | Browser | IDE webview |
|---|---|---|---|
| **Base URL / transport** | Core's loopback URL (Tauri injects the ephemeral port) | same-origin (Core serves the page) or a configured remote URL + token | Core URL passed in by the extension host |
| **Folder picker** | Tauri `dialog.open()` → native OS picker | `<input type="file" webkitdirectory>` or user-typed/host-known path | extension `showOpenDialog` via `postMessage`, or host-known workspace folder |
| **Secure storage** | Tauri OS-keychain plugin | none — token in memory only, never `localStorage` (XSS rule) | delegate to extension `SecretStorage` |
| **Auth for writes** | loopback → `X-AIDT` only | loopback: `X-AIDT`; **remote: `X-AIDT` + bearer token** | inherits the running Core (loopback) |
| **Open external links** | Tauri shell-open | `window.open` | extension `openExternal` |
| **Window chrome** | custom titlebar / tray hints | none | none (panel) |

Everything else — every component, every service, all routing, the whole render tree — is
**identical across hosts**. Host-specific code is confined to ~3 small bridge
implementations plus a boot-time selector in `app.config.ts` (an injection token resolving
to the right bridge).

### 4.2 Tauri WebView specifics (the gotchas)

Tauri uses the **system WebView (WKWebView on macOS, WebView2/Chromium on Windows), not a
bundled Chromium**. Practical FE consequences:

- **Angular runs fine in the system WebView** — it is standard web (no Chromium-only
  assumptions). Test on WKWebView early (Jorge R8): avoid bleeding-edge CSS; `EventSource`
  is supported (our realtime works); Intl/date parity is fine.
- **No Node APIs in the WebView.** The webview is pure web; **there is no Node in it** —
  anything native (file picker, keychain) goes through the Tauri IPC bridge. Our
  `PlatformBridge` is exactly that boundary.
- **Canvas on WKWebView** is the specific risk (Rete + transform-heavy live token).
  Keep animation GPU-friendly (`transform`/`opacity` only, no layout thrash), respect
  reduced-motion, and spike a 50-node canvas on WKWebView in the Workflow phase before
  committing to animation richness.
- **Asset serving:** the bundle is served by Core over loopback (consistent with
  browser/remote), **not** via the `tauri://` asset protocol — one serving path; SSE/fetch
  are same-origin to Core.
- **Single-instance / port discovery** (Jorge R9): the bridge reads Core's ephemeral port
  from a discovery file in `~/.aidevteam/` (or a Tauri-injected env) so the IDE webview and
  the desktop app attach to the *same* Core rather than racing.

### 4.3 Auth & transport summary

- **GET/SSE are read-only** and skip the guard — remote *viewing* works with just the URL.
- **All writes** send `X-AIDT` (the CSRF defense; verified in `guard.js`). The browser
  bridge adds a **bearer token** for off-loopback writes (the guard refuses remote writes
  unless explicitly enabled + token layered at the app level). Secrets never touch
  `localStorage` or the workflow/ledger files — the IDE/Tauri keychain holds them; the
  browser keeps them in memory.

---

## 5. Tasks + Base views

### 5.1 Tasks — componentization (Concept A first)

The board is the **lowest-risk, highest-reuse** view — it's the hub board, lifted into
Angular:

- `<task-board>` (Concept A, default) — columns by status, sortable, with a **List view**
  toggle and filters ("needs human", by agent).
- `<ticket-card>` — ported `renderCard`, plus a **last-comment preview** and inline
  **Approve / Request-changes** buttons when status is "Needs You" (writes go through the
  gate/advance API).
- `<ticket-timeline>` dialog — the ported comment timeline, **attributed + kind-tagged**,
  append-only agent narrative + human notes. Adds the **🔗 recalled chip** linking the
  Base doc an agent used.
- `<task-archive>` — done tickets + full retained history; a view over the same comment
  data, filtered by status + completed-at.

**Reuse map (from the hub):** status label, agent badge, gate chips, the timeline,
`relTime`, the diff→toast engine, the `slidein`/`flash` animations, the modal focus trap —
**all already exist and are correct** as plain TS/CSS; this view is mostly assembly +
Angular templating.

### 5.2 The Conveyor (Concept B) — feasibility

Aura's recommendation (ship A as default, B as a toggle on the **same data model**) is
right and **cheap for one dev**:

- Same ticket signal/data source; B is a second presentational component
  (`<conveyor-belt>` + `<parcel>`), not a second data path.
- **Perf:** parcels are a bounded set (tickets in flight), animated with
  `transform`/`opacity` — fine for tens of items. Cap animated parcels; beyond a
  threshold, fall back to static positions.
- **a11y:** reduced-motion → parcels teleport+highlight; the **Board view toggle is always
  one tap away**; tapping a parcel opens the identical timeline. Position-as-status still
  needs a text/glyph label per parcel (color-never-alone).
- **Verdict:** feasible, low marginal cost. **Ship it last** — the "demo wow," not the
  workhorse.

### 5.3 Base — editor + recall indicator

- `<base-doc-list>` — categorized docs (code rules / policy / copyright / context) with
  the **recall-state indicator**: `indexed ✓` / `active ◉` / `recalled (pulse)` /
  `indexing ◐` / `failed ⚠`. A small status component in the same family as the gate chips
  (color + glyph + text).
- `<base-doc-editor>` — a plain markdown textarea (driven by **Signal Forms**) with **live
  save + auto re-index** (debounced). Delete confirms (it changes agent behavior). Empty
  state per Aura.
- **Recall provenance (Aura cross-view):** when an agent recalls a doc, the doc row pulses
  and links to the **ticket history entry** where it was used — the same 🔗 chip shown in
  the Tasks timeline. Both surfaces consume the *same recall event* from the stream
  (single source of truth).
- **Indexing states** are fed by Core (memory subsystem). The FE never assumes indexing
  succeeded; `failed ⚠` + Re-index is a first-class state (graceful degradation — recall
  down never blocks).

---

## 6. Phased FE delivery plan

Right-sized per the workflow-engine's proportional principle. Each phase is shippable and
proves a piece of the wedge; the **zero-dep hub keeps working throughout**. Per the
owner's sequencing decision, the **multi-project shell comes first**.

| Phase | Ships | Proves | Reuse leverage | Risk |
|---|---|---|---|---|
| **0. Floor** | Keep `index.html` serving at `/legacy`; stand up Angular CLI + zoneless + TS skeleton, `theme.css` (lifted tokens), `PlatformBridge` (browser impl), `EventStreamService` | "nothing breaks; new shell boots" | theme + SSE client | low |
| **1. Projects Home + Shell + Overview** | Project grid, connect→analyze pipeline (states), left rail with live badges, multi-project switching + per-project preserved state | **multi-project shell FIRST** (owner's sequencing) | bridge file-picker | med (connect flow states) |
| **2. Tasks (Board) + Timeline** | Port the board, cards, status/gate/agent components, dialog, timeline, diff→toasts | the **30-sec wow** + audit history — the durable value | **highest** (≈80% exists as plain TS) | low |
| **3. Base** | Doc list + editor (Signal Forms) + recall indicators + provenance chip | governance / "rules with teeth" | status-chip family | med (recall states) |
| **4. Workflow (read + edit)** | Rete.js canvas + Angular node components, inspector, validation, lossless round-trip, autosave | "see the program" (read-only first, then edit) | stage-hue tokens | **high** (new dep, `@angular/elements` re-mount, a11y, round-trip) |
| **5. Workflow (live run)** | Run bar, token animation, active-node halo, run log, streaming inspector, run-state machine, a11y list view | "enforcement is visible" — the differentiator | run events | high (anim perf, a11y) |
| **6. Conveyor view** | `<conveyor-belt>` toggle on the Tasks data | delight / demo | Tasks data model | low |

**Cross-cutting, every phase:** TDD (tests before each ported function/component),
`tsc`/template type-check clean, axe/a11y clean, reduced-motion respected, Playwright
visual checks (the skill's Browser MCP workflow). The hub already ships a Playwright e2e
harness (`hub/e2e/`) we extend.

**Sequencing note.** Aura §12 suggested Home → Shell → Tasks → Base → Workflow. The owner's
decision puts the **multi-project shell first** (Phase 1), with Tasks as Phase 2 — the
single-project React-era plan that shipped Tasks first is superseded. Tasks remains the
highest-reuse, lowest-risk *content* and lands immediately after the shell frame exists, so
the de-risking value of the port is preserved.

---

## 7. Build-vs-reuse — frontend libraries (all OSS/MIT, zero paid)

Angular-ecosystem table:

| Need | Decision | License | Rationale |
|---|---|---|---|
| Framework | **Angular 21** | MIT | owner-locked; KGB stack consistency; Signals/zoneless |
| Build/dev | **Angular CLI** (esbuild/Vite app builder) | MIT | fast HMR, no hand-written bundler config, budgets |
| Language | **TypeScript (strict)** | Apache-2.0 | skill standard |
| Workflow canvas | **Rete.js v2 + `rete-angular-plugin`** | MIT | the one option built for graphs that *execute* (dataflow/control-flow engines); official Angular renderer (v12–21); lazy-loaded |
| Canvas fallback | **ngx-vflow** (held in reserve) | MIT | signals-native, least friction with zoneless, if Rete ergonomics cost too much |
| Server data + realtime | **`HttpClient` + native `EventSource`, bridged to Signals (`toSignal`)** | — | reuse hub SSE; no data-fetching library needed |
| Reactive edge | **RxJS 7.x** | Apache-2.0 | SSE stream, reconnect/backoff, diff fold; ships with Angular |
| Client UI state | **Angular Signals in services** (NgRx SignalStore in reserve) | MIT | tiny, no boilerplate; SignalStore only for complex slices |
| Forms | **Signal Forms** (v21) | MIT | typed, signal-driven; node inspector + Base editor + connect form |
| Styling | **CSS custom properties (lifted hub tokens)** | n/a | hub proves zero-dep theming works; no utility framework |
| Icons | **Lucide** (or keep monoline glyphs) | ISC | Aura maps glyphs→Lucide; tree-shakeable; glyphs need no dep |
| Testing | **Vitest (`@analogjs/vite-plugin-angular`) + Testing Library (Angular) + Playwright** | MIT | unit/integration/e2e; extend existing `hub/e2e` |
| a11y | **axe + Angular a11y lint** | MIT | WCAG 2.2 AA per skill |

**Explicitly NOT adding:** Redux/full NgRx Store (SignalStore only where justified), a
WebSocket lib, a CSS-in-JS runtime, a component kit (Material/PrimeNG would fight the hub's
bespoke dark theme and bloat the bundle), or any paid/cloud SDK. Everything stays OSS-first
per the framework's no-lock-in rule.

---

## 8. The explicit "MVP that keeps the zero-dep hub working" option

A first-class deliverable, not a footnote — unchanged by the framework move:

- **`hub/public/index.html` stays in the repo and stays served** by Core at `/legacy`
  (and remains the bare-`node hub/server.js` experience for single-project users).
- It is the **fallback MVP**: anyone can run the existing zero-dependency hub today, with
  no build step, and get a live single-project board. The Angular shell is **additive** —
  it does not delete the floor.
- The Tasks board (Phase 2) is a *parity* port of that file, proven equal by snapshot
  tests against the vanilla output — so we flip the default `/` from vanilla to Angular
  **only when parity is proven**, keeping `/legacy` as the safety net.
- If at any point the Angular shell is blocked (e.g. Tauri sidecar packaging, Jorge R4),
  **the product still has a working browser MVP** — the zero-dep hub — to demo and ship.

---

## 9. Risks (FE-specific) & open questions

| # | Risk / question | Severity | Mitigation / who |
|---|---|---|---|
| F1 | Canvas transform/animation perf on **WKWebView** (live token + 50+ nodes) | High | Spike a 50-node canvas + token anim on WKWebView in Phase 4 before committing to anim richness (Jorge R8) |
| F2 | **Lossless round-trip** (graph ↔ `workflow.graph.json`) silently breaks | High | Property test serialize∘parse = identity, in CI from Phase 4 |
| F3 | **Rete `@angular/elements` re-mount / state reuse** (Web Components can't be unregistered) | Med-High | Stateless node elements (state in signals keyed by id); mount once per route; test mount/unmount early |
| F4 | **Keyboard a11y** for node-connect (WCAG 2.5.7) is non-trivial with any canvas pointer model | Med | Budget explicit time; ship the accessible list-view alternative regardless |
| F5 | **Status-derivation regression** during the vanilla→Angular port (blocked-by-hard-gate rule) | Med | Snapshot tests against current vanilla output before porting the pure functions (§1.5) |
| F6 | **Browser host can't read arbitrary folder paths** for "connect a project" | Med | Bridge: browser uses host-known project or user-typed path; native picker only in Tauri/IDE |
| F7 | **Angular bundle floor** is higher than React's | Low-Med | Standalone + zoneless + tree-shaking + lazy Workflow chunk; CLI budgets enforce limits |
| F8 | **Per-project SSE fan-out** (N connections) with many projects | Low-Med | MVP is few projects; move to multiplexed Core stream when needed |
| F9 | **Remote-write auth** layering (token on top of `X-AIDT`) not yet specified server-side | Med | Coordinate with /be + /secops; bridge ready to attach a bearer; guard already refuses remote writes by default |

**Open questions for /po + /arch:**
1. Is the Workflow **builder (editing)** v1, or read-only-first? *FE assumes read-only
   render in the thin MVP, full editing as fast-follow (Phases 4–5), matching the VISION
   MVP.*
2. **Rete.js v2** confirmed as the canvas dependency (vs the ngx-vflow fallback)? *FE
   recommends Rete for the execution-model fit; fallback is contained to Phase 4.*
3. Single-project-first vs multi-project-shell-first? *Owner sequenced the multi-project
   shell first (Phase 1); Tasks lands Phase 2 — no rework either way.*
4. Remote-write token scheme — needs a /be + /secops contract before remote work.

---

## 10. KGB alignment note

The Product Owner locked Angular **specifically for consistency with the KGB project**,
which is also Angular and which the owner will align to **Angular 21**. Practical
consequences for this plan:

- **Shared component library is possible.** The hub-canon presentation components
  (status label, agent badge, gate/recall chips, comment timeline, dialog primitive,
  toast rail) are framework-agnostic logic wrapped in standalone Angular components — they
  can be extracted into a shared Angular package consumed by both Constellation and KGB.
- **Shared tooling.** One CLI/test/lint config (Vitest + `@analogjs/vite-plugin-angular`,
  Playwright, axe) and one bundle-budget discipline apply to both.
- **Canvas portability.** Rete.js v2's framework-agnostic core means the graph/runtime
  model could be reused in KGB even if a panel renders differently — reinforcing the
  shared-tooling rationale.
- **Caveat:** alignment depends on the owner moving KGB to Angular 21; until then,
  treat shared packages as a goal, not a hard dependency. Nothing in this plan blocks on
  KGB.

---

## 11. One-paragraph summary

Build the cockpit in **Angular 21** (owner-locked for KGB stack consistency) — standalone
components, Signals, zoneless change detection, Signal Forms, RxJS only at the SSE edge —
while **keeping the zero-dependency `index.html` hub alive and served at `/legacy`** as the
floor and graceful-degradation surface. For the visual workflow builder, use **Rete.js v2
with its official Angular renderer**, chosen over ngx-vflow and @foblex/flow because the
workflow is **a program that executes** and Rete is the one library purpose-built for node
graphs with real execution engines (Core stays the authoritative compiler/runtime). Lift
the hub's already-correct, framework-agnostic presentation logic — status derivation, gate
chips, agent badges, the comment timeline, the SSE diff→toast engine, the dark theme — into
Angular services and standalone components, locked against regression by snapshot tests.
Serve **one bundle to three hosts** (Tauri WebView, browser, IDE webview) behind a thin
`PlatformBridge` service that isolates transport, folder-picker, and secure-storage (no
Node in the webview); everything else is identical. Reuse the hub's **SSE** for realtime
(no WebSockets for MVP) with per-project multiplexing, **Signals + services** for lean state
(NgRx SignalStore only where justified), and the server's existing **CAS `expectedRev` 409
reconcile** for safe optimistic writes. Ship in phases — **multi-project shell first** (the
owner's sequencing), then Tasks (highest reuse, ~80% already exists), Base, the Workflow
builder, live-run trace, and the Conveyor — each buildable by one developer, each OSS-first
with zero paid dependencies, and each a step toward a shared Angular foundation with KGB.

---

*Sources (canvas-library evaluation): [Rete.js](https://retejs.org/) ·
[Rete.js Angular renderer](https://retejs.org/docs/guides/renderers/angular/) ·
[ngx-vflow](https://www.ngx-vflow.org/) ·
[@foblex/flow](https://flow.foblex.com/).*
