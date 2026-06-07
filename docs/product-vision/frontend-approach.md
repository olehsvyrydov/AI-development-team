# Frontend Implementation Approach — ADT Constellation / Studio Cockpit

> **/fe (Finn) — Frontend implementation approach.** Plan/assessment only; no
> production code in this document.
> **Inputs:** `architecture.md` (Jorge), `ui-design.md` (Aura), `ba-requirements.md`
> (Anna), `strategy.md` (Apex), and the actual `hub/` source (read, not assumed).
> **Gate status:** This is input to implementation, not an approval. `ARCH_APPROVED`
> and `SECOPS_APPROVED` are still pending per the architecture doc; this FE plan
> assumes they land before code. `DESIGN_APPROVED` is soft — Aura's spec is draft.

---

## 0. TL;DR (decisions, up front)

1. **Framework: React 19 + Vite + TypeScript.** Move off the single vanilla
   `index.html`, but **keep that file alive and shipping** as the zero-dep fallback
   MVP (the "browser MVP") until the React shell reaches parity on the Tasks board.
   React is non-negotiable for the workflow builder because **React Flow is a React
   library** and is the one new dependency every input already endorses.
2. **One codebase, three hosts** via a thin `PlatformBridge` abstraction (transport +
   capabilities). The same Vite bundle is served by Constellation Core over HTTP/SSE
   and loaded in (a) Tauri WebView, (b) a plain browser, (c) an IDE webview. Hosts
   differ only behind the bridge: file-picker, secure storage, base URL/auth.
3. **Realtime: reuse the hub's SSE (`/api/events`)** as-is; add **per-project
   multiplexing**. Do **not** introduce WebSockets for MVP. Writes go through the
   existing POST API with the `X-AIDT` CSRF header and the **CAS `expectedRev` 409
   reconcile** loop already implemented server-side.
4. **State: lean.** TanStack Query for server cache + SSE-fed invalidation;
   **Zustand** for the few pieces of genuine client UI state (active project,
   canvas selection, run-trace overlay). No Redux. The workflow graph is local
   editor state synced to `workflow.graph.json` via debounced autosave.
5. **Reuse the hub UI logic verbatim** — `StatusLabel`, `AgentBadge`, gate chips,
   the comment timeline, the SSE diff→toast engine, the stage-hue token system, and
   the entire dark theme are **lifted from `index.html` into typed React components**.
   This is the single biggest de-risking lever: the hard, already-correct
   presentation logic (status derivation, blocked-by-hard-gate rule, relative time,
   gate-state glyphs) is ported, not reinvented.
6. **Phased delivery** keeps the zero-dep hub as the floor; ships Tasks first (highest
   value, lowest risk, reuses the most), then Base, then the Workflow builder
   (edit), then live-run trace, then the Conveyor view.

---

## 1. The central tension — vanilla vs. a framework

### 1.1 What we have today (verified against source)

`hub/public/index.html` is **612 lines**: one `<style>` block (the full dark theme +
all state/stage tokens) and one `<script>` of dependency-free vanilla JS. It already
implements, correctly, the things that are *hard to get right*:

- **Status derivation** (`derivedStatus`, `blockingGate`) — a ticket is "blocked"
  only by a **rejected hard gate**; soft-gate rejection does not block. This mirrors
  the server's canonical derivation and must not regress.
- **Gate chips** with `passed/pending/rejected/na` states, `hard`/`soft` modifier
  (solid vs dashed left border), and a safety glyph (`⛉`).
- **AgentBadge** with assigned (`adot`) vs expected-owner (dashed, muted) variants.
- **Comment timeline** (newest-first, attributed, kind-tagged, `slidein` animation).
- A complete **SSE client** with auto-reconnect, a **diff engine** (`snapshot` →
  `diffToasts`) that emits toasts on stage/assignee/comment/gate transitions, and
  **card-flash** on change.
- A **focus-trapped, Esc-closable modal** with `aria-modal`.
- Full **`prefers-reduced-motion`** handling and color-never-alone status labels.

This is roughly **80% of the Tasks view already written** — just not componentized
or typed, and single-project only.

### 1.2 Why vanilla cannot carry the new vision

The vision adds three things vanilla makes painful:

- **The Workflow builder** needs nodes/edges/pan/zoom/minimap/keyboard-connect.
  Hand-rolling this in vanilla is months of work; **React Flow gives it for free**
  and is a React component. Every upstream doc (Jorge §6, Aura §12, Anna, Apex) names
  React Flow. This alone forces React.
- **Multi-project shell** (rail + Overview + project switching with per-project
  preserved state) is a real component tree with routing and shared state — exactly
  what a framework manages and vanilla string-templating does not.
- **Live-run trace** (token animating along edges, active-node halo, streaming
  inspector) is stateful, per-frame, and tied to realtime events — manageable in
  React with refs/RAF, miserable in ad-hoc vanilla.

### 1.3 Decision: React 19 + Vite + TypeScript — with the vanilla hub as the floor

| Option | Verdict | Why |
|---|---|---|
| **Keep vanilla** | No (for the rich shell) | Cannot host React Flow; multi-project + live-run are too stateful |
| **React + Vite** | **Chosen** | React Flow is React-native; team's `/fe` default stack; huge ecosystem; Vite = fast HMR, tiny config |
| Preact | Tempting (3KB) but no | React Flow + xyflow target React 18/19; Preact/compat is a constant friction tax on the one library that matters |
| Svelte/Solid | No | Would orphan the React-Flow ecosystem and the team's React expertise; no payoff for a desktop dashboard |

**TypeScript strict** (skill standard: no `any`, explicit public return types).

**Bundle budget.** A dashboard in a desktop shell is not latency-critical (it loads
from loopback), but we still keep it lean for the browser/IDE-webview paths:
- React 19 + ReactDOM ≈ ~45KB gzip.
- React Flow (`@xyflow/react`) ≈ ~50KB gzip — **lazy-loaded only on the Workflow
  route** so Tasks/Base/Overview never pay for it.
- TanStack Query ≈ ~13KB, Zustand ≈ ~1KB.
- **Target: initial route (Projects Home + Tasks) < 150KB gzip**; Workflow route is a
  separate async chunk. Tailwind v4 isn't required — Aura's design is a token set we
  can ship as plain CSS (the hub already proves this), so **we keep CSS-as-tokens and
  skip a utility framework** to avoid bundle + build weight. (Open to Tailwind v4 if
  the team prefers; not load-bearing.)

**The fallback contract.** The zero-dep `index.html` is **not deleted**. It stays as:
- the **"browser MVP"** that works with zero build for anyone running bare `node
  hub/server.js` on a single project, and
- the **graceful-degradation** surface if the React bundle fails to load.
Core keeps serving it at a legacy route (e.g. `/legacy`) while the React app owns `/`.
This honors Apex's "the Hub demo is the rebuttal" and Anna's "extends rather than
rebuilds."

### 1.4 Migration path that preserves the working hub board

The port is **mechanical, not a redesign** — same logic, typed and componentized:

| Hub logic (vanilla) | Becomes (React/TS) | Notes |
|---|---|---|
| `STATUS_LABEL`, `GATE_GLYPH`, `STAGE_TOKEN`, `stageVar`, `stagePillStyle` | `lib/status.ts` constants + helpers | Pure, copy-paste-port; unit-test parity against current behavior |
| `derivedStatus`, `blockingGate`, `chipState` | `lib/derive.ts` | **Snapshot-test against the vanilla output** so the hard-gate rule can't drift |
| `relTime` | `lib/time.ts` | trivial |
| `renderAgent` | `<AgentBadge t owners />` | assigned vs expected variants |
| `renderGateChip` / `renderGateRow` | `<GateChip>` / `<GateRow>` | |
| `renderCard` | `<TicketCard>` | |
| `renderModal` + focus trap + `onModalKey` | `<TicketModal>` (or a `<Dialog>` primitive) | keep the focus trap + Esc; consider `<dialog>` element |
| `snapshot` / `diffToasts` / `toast` | `useSseDiff()` hook + `<ToastRail>` | the diff engine is reusable as-is, keyed by ticket id |
| SSE `EventSource('/api/events')` + reconnect | `useEventStream(projectId)` hook | add project scoping |
| the `<style>` block | `theme.css` (CSS custom properties) | **lifted verbatim**; Aura's additive tokens appended |

**Test strategy for the port (TDD, per skill):** before porting each pure function,
write a unit test that asserts the *current* vanilla output for a fixed ticket
fixture, then port until green. This guarantees the board's correctness survives the
framework move — the highest-risk regression (the blocked-by-hard-gate rule) is
locked by a test.

---

## 2. One codebase, three hosts

The UI is **plain web served over HTTP/SSE** (exactly as the hub does today, per
Jorge §3 "Browser + remote fallback"). That is the unifying insight: **all three
hosts load the same bundle from the same Core**; only a thin bridge differs.

```
            ┌─────────────────────────── same Vite bundle ───────────────────────────┐
            │   React app  ·  PlatformBridge (transport + capabilities interface)     │
            └───────────────┬───────────────────┬───────────────────┬────────────────┘
                            │                   │                   │
                ┌───────────▼──────┐ ┌──────────▼────────┐ ┌────────▼─────────────┐
                │ TauriBridge      │ │ BrowserBridge     │ │ IdeWebviewBridge     │
                │ (desktop)        │ │ (local / remote)  │ │ (Kiro/VS Code/Cursor)│
                └───────────┬──────┘ └──────────┬────────┘ └────────┬─────────────┘
                            └──────────── HTTP + SSE on 127.0.0.1 ───┘  → Constellation Core
```

### 2.1 The `PlatformBridge` interface (what differs)

A single typed interface, three implementations, chosen once at boot by host
detection (`window.__TAURI__`, `acquireVsCodeApi`, else browser):

| Capability | Tauri WebView | Browser | IDE webview |
|---|---|---|---|
| **Base URL / transport** | Core's loopback URL (Tauri injects the ephemeral port) | same-origin (Core serves the page) or a configured remote URL + token | Core URL passed in by the extension host |
| **Folder picker** (connect a project) | Tauri `dialog.open()` → native OS picker | `<input type="file" webkitdirectory>` (browser cannot read arbitrary paths → user types/pastes path, or Core offers host-known project) | extension's `showOpenDialog` via `postMessage` to the host, or host-known workspace folder |
| **Secure storage** (SDK API key, remote token) | Tauri OS-keychain plugin | none — token in memory only, never `localStorage` (XSS rule) | delegate to extension `SecretStorage` |
| **Auth for writes** | loopback → `X-AIDT` header only | loopback: `X-AIDT`; **remote: `X-AIDT` + bearer token** (guard requires it off-loopback) | inherits the running Core (loopback) |
| **Open external links** | Tauri shell-open | `window.open` | extension `openExternal` |
| **Window chrome** | custom titlebar / tray hints | none | none (panel) |

Everything else — every component, every hook, all routing, the whole render tree —
is **identical across hosts**. Host-specific code is confined to ~3 small bridge
files plus a boot-time selector. This is the cheapest possible "write once, run in
three shells."

### 2.2 Tauri WebView specifics (the gotchas)

Tauri uses the **system WebView (WKWebView on macOS, WebView2/Chromium on Windows),
not a bundled Chromium**. Practical FE consequences:

- **No Chromium-only assumptions.** Test on WKWebView early (Jorge R8). WKWebView is
  Safari-engine: watch for newer CSS (`:has()` is fine on current Safari; avoid
  bleeding-edge), `EventSource` is supported (good — our realtime works), and
  date/Intl parity is fine.
- **React Flow on WKWebView** is the specific risk. React Flow uses CSS transforms +
  pointer events heavily; both are well-supported, but **transform-heavy animation
  (the live token)** must be GPU-friendly (`transform`/`opacity` only, no
  layout-thrash) and respect reduced-motion. Spike a 50-node canvas on WKWebView in
  Phase 4 before committing to the live-run animation richness.
- **No Node APIs in the WebView.** The WebView is pure web; anything native goes
  through the Tauri IPC bridge (file picker, keychain). Our `PlatformBridge` is
  exactly that boundary.
- **Asset serving:** the bundle is served by Core over loopback (consistent with
  browser/remote), **not** via the `tauri://` asset protocol — this keeps one serving
  path and means SSE/`fetch` are same-origin to Core. Simpler and uniform.
- **Single-instance / port discovery** (Jorge R9): the bridge reads Core's
  ephemeral port from a discovery file in `~/.aidevteam/` (or a Tauri-injected env)
  so the IDE webview and the desktop app attach to the *same* Core rather than racing.

### 2.3 Auth & transport summary

- **GET/SSE are read-only** and skip the guard — so remote *viewing* works with just
  the URL (matches AC-G2.2 read-only-without-write).
- **All writes** send `X-AIDT` (the CSRF defense; verified in `guard.js`). The browser
  bridge adds a **bearer token** for off-loopback writes (the guard refuses remote
  writes unless `--allow-remote-writes` + we layer the token at the app level per
  AC-G2.2). Secrets never touch `localStorage` or the workflow/ledger files
  (AC-F2.3) — the IDE/Tauri keychain holds them; the browser keeps them in memory.

---

## 3. The Workflow builder (React Flow)

### 3.1 Library & integration

- **`@xyflow/react`** (React Flow v12, MIT). Lazy-loaded on the `/project/:id/workflow`
  route only.
- **Data model** is Jorge's `workflow.graph.json` (nodes/edges, per project, in
  `.aidevteam/`). The FE maps React-Flow `Node`/`Edge` objects ↔ the persisted graph
  schema. **The graph file is the source of truth; React Flow is the editor view.**
  Round-trip must be lossless (AC-C4.2) — a serialize/parse property test enforces it.

### 3.2 Node types (custom React-Flow node components)

One custom node component per Jorge/Aura taxonomy, all styled from the existing
stage-hue tokens so `/rev` is the same violet everywhere:

| Node | Glyph | Custom component | Inspector fields |
|---|---|---|---|
| Trigger | ⚡ | `TriggerNode` | event/stage/cron/file-change/manual |
| Agent | ◆ | `AgentNode` | agent (`/role` select), mode (fg/bg), instructions, outputs, on-error |
| Conditional | ◇ | `ConditionalNode` | expression over gate/ledger state; yes/no/case ports |
| Loop | ↺ | rendered as a routed **dashed edge** back to an earlier node | `maxIters`, exit condition |
| Gate | (barrier) | `GateNode` | maps to a `workflow.yaml` gate name (validated) |
| Background | ☾ | `BackgroundAgentNode` (dashed border, bottom lane) | trigger condition |
| Merge | ⏚ | `MergeNode` | — |

**Inspector** (`<NodeInspector>` / `<EdgeInspector>`): a contextual right panel that
swaps between node config and edge config (condition expression + label). Below `lg`
it becomes a slide-over sheet (Aura §10).

### 3.3 Validation against `workflow.yaml`

This is where the builder earns trust (Apex's "process with teeth"). The FE runs
**client-side validation for fast feedback**, but the **Core compiler is
authoritative** (Jorge §6):

- A node cannot claim a gate that doesn't exist in `workflow.yaml` → the agent/gate
  selects are populated from the project's gate defs (already exposed via
  `state.gateDefs`, seen in `api.js` `gate/set`).
- **`safety_override` gates cannot be bypassed** — the editor refuses to delete/skip
  them and marks them visually locked.
- **Loops must be bounded** (`maxIters`) and have a reachable exit (AC-C3.4) — the
  editor warns on an unreachable-exit loop *before save*.
- **Dangling references** (deleting a loop target, AC-C2.3) are flagged before save.
- On save, the FE POSTs the graph; **Core compiles + validates** and returns errors
  the editor surfaces inline (AC-C4.3 — never silently drop steps).

### 3.4 Live run visualization (the headline)

Driven entirely by **realtime events** from Core (SSE), not client guessing:

- **Token** = a glowing accent dot animated along the active edge using an SVG
  `<animateMotion>` or a RAF-driven `transform` on an overlay positioned from the
  edge path. Capped ~400ms, edge-length-scaled (Aura §11).
- **Active node** = accent halo + slow pulse (reuse the hub's `live` pulse keyframe) +
  `◉ ACTIVE` badge. Done = green check + 70% opacity. Pending = 38% dim. Failed = red
  ring.
- **Run log** replaces the palette during a run; clicking a row recenters the canvas
  (React Flow `setCenter`).
- **Active-node inspector** streams the agent's live output (an SSE-fed text buffer)
  and offers **Pause here** (soft breakpoint).
- **Run state machine:** `idle → running ↔ paused → done | failed | stopped`
  (Aura §4.3). Modeled as a small Zustand slice fed by run events.

**WCAG dragging-alternative (2.5.7) — mandatory, not optional (skill + Aura §9):**
- Node creation: palette **click-to-insert-after-selected**, not only drag.
- Connections: **keyboard port-connect** (focus a port → Enter → arrow to target →
  Enter). React Flow supports custom keyboard handlers; we wire them, don't assume.
- An **accessible list view** of the graph ("/be → /rev (on done); /rev → /be
  (loop)") as an `aria` alternative to the spatial canvas (Aura §9).
- Run state announced via `aria-live="polite"`.
- All interactive targets ≥24px (≥44px on coarse pointers).

### 3.5 Effort & risks

- **Effort:** Builder (edit) ≈ the largest single FE chunk — ~2–3 weeks for a
  competent dev (custom nodes, inspector, validation, autosave, round-trip). Live-run
  trace ≈ another ~1–1.5 weeks (animation + run-state wiring + a11y list view).
- **Risks:** (a) React Flow on WKWebView transform performance (spike early, Jorge
  R8); (b) keyboard-connect a11y is fiddly with React Flow's pointer model — budget
  time; (c) lossless round-trip is easy to break — lock with a property test;
  (d) live-token animation perf with many edges — cap concurrent animations, prefer
  `transform`/`opacity`.

---

## 4. Realtime + state

### 4.1 Transport: reuse SSE, skip WS for MVP

The hub already ships a working `GET /api/events` SSE stream with `update` events and
client auto-reconnect. **Reuse it.** Decision: **no WebSockets for MVP** —

- SSE is one-directional server→client, which is exactly the mirroring need (AC-B2.1);
  writes go over POST. This matches the hub's proven model and avoids a second
  transport.
- The optional WS (Jorge mentions it) is deferred; revisit only if we need
  high-frequency bidirectional streams (e.g. token-level agent output) that SSE
  text-streaming can't handle comfortably. SSE can already stream incremental text,
  so the bar for WS is high.

### 4.2 Multi-project subscription

The hub SSE is single-project. For N projects (AC-B2.2 "see which project changed
even when not viewing it"):

- **Option A (chosen for MVP):** one SSE connection per connected project, each
  scoped by `projectId`, multiplexed in a `useEventStream(projectId)` hook; a small
  registry of streams keyed by project id. Simple, isolates failures (one stale
  project doesn't kill others — AC-B2.3).
- **Option B (later):** a single multiplexed Core stream emitting
  `{ projectId, update }` envelopes. Cleaner at scale (many projects), but a Core
  change. Defer until project counts justify it.

Per-project live badges on the rail/cards consume the stream even when that project
isn't the active view — the diff engine already computes "what changed," we just
route the badge update.

### 4.3 Client state management (lean)

| Concern | Tool | Why |
|---|---|---|
| Server data (board, tickets, comments, base docs, graph) | **TanStack Query** | caching, background refetch; SSE events trigger `queryClient.invalidateQueries` / direct cache writes |
| Active project, canvas selection, run-trace overlay, view toggles | **Zustand** | tiny, no boilerplate, no provider tax |
| Workflow graph editor state | local React state + Zustand slice | debounced autosave to `workflow.graph.json` |
| Auth token / secrets | bridge (keychain or in-memory) | never in app state, never persisted to web storage |

No Redux. The hub's existing `snapshot/diff` logic becomes the bridge between an SSE
`update` payload and Query cache updates (it already tells us precisely which tickets
changed → targeted cache writes + card flash).

### 4.4 Optimistic writes + CAS 409 reconcile (already half-built server-side)

`api.js` implements **atomic CAS** via `readModifyWriteLedger(project, expectedRev,
…)` and returns **`{ code: 409, conflict: true, state }`** on a stale write. The FE
contract:

1. Every mutation (advance/assign/gate/comment) sends the current `expectedRev`.
2. **Optimistic update** to the Query cache for snappy UI.
3. On **409**: the server returns the fresh `state` — **reconcile** by replacing the
   cache with that state, re-deriving status, and (if the user's intent still applies)
   retrying once against the new rev; otherwise surface a non-destructive "someone
   changed this — re-applied latest" toast. This satisfies AC-D2.4 (no lost
   history/updates, order preserved) without the FE inventing conflict logic — the
   server already hands back the truth.
4. All writes carry the `X-AIDT` header (CSRF guard) + bearer token when remote.

---

## 5. Tasks + Base views

### 5.1 Tasks — componentization (Concept A first)

The board is the **lowest-risk, highest-reuse** view — it's the hub board, lifted:

- `<TaskBoard>` (Concept A, default) — columns by status, sortable, with a **List
  view** toggle (flat sortable table) and filters ("needs human", by agent).
- `<TicketCard>` — ported `renderCard`, plus a **last-comment preview** ("agent's
  voice") and inline **Approve / Request-changes** buttons when status is "Needs You"
  (writes go through `gate/set` / `ticket/advance`).
- `<TicketTimeline>` modal — the ported comment timeline, **attributed + kind-tagged**
  (AC-D2.2), append-only agent narrative + human notes (AC-D2.3). Adds the **🔗
  recalled chip** linking the Base doc an agent used (cross-view consistency, §5.3).
- `<Archive>` — done tickets + full retained history (AC-D3); a view over the same
  comment data, filtered by status + completed-at.

**Reuse map (from the hub):** `StatusLabel`, `AgentBadge`, gate chips, the timeline,
`relTime`, the diff→toast engine, the `slidein`/`flash` animations, the modal focus
trap — **all already exist and are correct**; this view is mostly assembly + typing.

### 5.2 The Conveyor (Concept B) — feasibility

Aura's recommendation (ship A as default, B as a toggle on the **same data model**) is
the right call and is **cheap for one dev**:

- Same `useTickets(projectId)` data; B is a second presentational layer
  (`<ConveyorBelt>` + `<Parcel>`), not a second data path.
- **Perf:** parcels are a bounded set (tickets in flight), animated with
  `transform`/`opacity` spring easing — fine for tens of items. Cap animated parcels;
  beyond a threshold, fall back to static positions. Not a 60fps particle system.
- **a11y:** reduced-motion → parcels teleport+highlight; the **Board view toggle is
  always one tap away**; tapping a parcel opens the identical timeline. Position-as-
  status still needs a text/glyph label per parcel (color-never-alone).
- **Verdict:** feasible and low marginal cost. **Ship it last** (Phase 6) — it's the
  "demo wow," not the workhorse.

### 5.3 Base — editor + recall indicator

- `<BaseDocList>` — categorized docs (code rules / policy / copyright / context)
  with the **recall-state indicator**: `indexed ✓` / `active ◉` / `recalled (pulse)`
  / `indexing ◐` / `failed ⚠`. This is a small status component in the same family as
  the gate chips (color + glyph + text).
- `<BaseDocEditor>` — a plain markdown textarea with **live save + auto re-index**
  (debounced). Delete confirms (it changes agent behavior). Empty state per Aura.
- **Recall provenance (AC-E2.2 / Aura cross-view):** when an agent recalls a doc, the
  doc row pulses and links to the **ticket history entry** where it was used — the
  same 🔗 chip shown in the Tasks timeline. Both surfaces consume the *same recall
  event* from the stream (single source of truth). This is the "rules with teeth"
  visible proof Apex wants — render it, don't fake it.
- **Indexing states** are fed by Core (memory subsystem). The FE never assumes
  indexing succeeded; `failed ⚠` + Re-index is a first-class state (AC-E2.3 graceful
  degradation — recall down never blocks).

---

## 6. Phased FE delivery plan

Right-sized per the workflow-engine's proportional principle. Each phase is shippable
and proves a piece of the wedge; the **zero-dep hub keeps working throughout**.

| Phase | Ships | Proves | Reuse leverage | Risk |
|---|---|---|---|---|
| **0. Floor** | Keep `index.html` serving at `/legacy`; stand up Vite+React+TS skeleton, `theme.css` (lifted tokens), `PlatformBridge` (browser impl), `useEventStream` | "nothing breaks; new shell boots" | theme + SSE client | low |
| **1. Tasks (Board) + Timeline** | Port the board, cards, status/gate/agent components, modal, timeline, diff→toasts | the **30-sec wow** + audit history (AC-D1/D2/D3) — the durable value | **highest** (≈80% exists) | low |
| **2. Projects Home + Shell + Overview** | Project grid, connect→analyze pipeline (states), left rail with live badges, multi-project switching + per-project preserved state | multi-project (AC-A/B) | bridge file-picker | med (connect flow states) |
| **3. Base** | Doc list + editor + recall indicators + provenance chip | governance / "rules with teeth" (AC-E) | status-chip family | med (recall states) |
| **4. Workflow (edit)** | React Flow canvas, custom nodes, inspector, validation, lossless round-trip, autosave | "see the program" (AC-C1/C2/C4) | stage-hue tokens | **high** (new dep, a11y, round-trip) |
| **5. Workflow (live run)** | Run bar, token animation, active-node halo, run log, streaming inspector, run-state machine, a11y list view | "enforcement is visible" — the differentiator | run events | high (anim perf, a11y) |
| **6. Conveyor view** | `<ConveyorBelt>` toggle on the Tasks data | delight / demo | Tasks data model | low |

**Cross-cutting, every phase:** TDD (tests before each ported function/component),
`tsc --noEmit` clean, axe/jsx-a11y clean, reduced-motion respected,
Playwright visual checks (the skill's Browser MCP workflow). The hub already ships a
Playwright e2e harness (`hub/e2e/`) we extend.

**Suggested build order matches Aura §12** (Home → Shell → Tasks → Base → Workflow →
live → Conveyor), with one deviation: **ship Tasks before the full Shell** as a
single-project React board first (drop-in replacement for `index.html` at `/`), so we
get the highest-reuse win in users' hands earliest, then wrap it in the multi-project
shell. This de-risks by validating the port before adding multi-project complexity.

---

## 7. Build-vs-reuse — frontend libraries (all OSS/MIT, zero paid)

| Need | Decision | License | Rationale |
|---|---|---|---|
| Framework | **React 19** | MIT | team default; React-Flow native |
| Build/dev | **Vite** | MIT | fast HMR, tiny config, great TS DX |
| Language | **TypeScript (strict)** | Apache-2.0 | skill standard |
| Workflow canvas | **@xyflow/react (React Flow v12)** | MIT | the *only* new heavy dep; everyone endorses it; lazy-loaded |
| Server cache | **TanStack Query v5** | MIT | SSE-fed cache, dedup, background refresh |
| Client UI state | **Zustand v5** | MIT | tiny, no boilerplate |
| Styling | **CSS custom properties (lifted hub tokens)** | n/a | hub proves zero-dep theming works; Tailwind v4 optional, not required |
| Icons | **Lucide** (or keep monoline glyphs) | ISC | Aura maps glyphs→Lucide; tree-shakeable; glyphs need no dep at all |
| Routing | **React Router** (or a tiny hash router) | MIT | shell needs routes; keep minimal |
| Realtime | **native `EventSource`** | — | reuse hub SSE; **no library** |
| Testing | **Vitest + Testing Library + Playwright** | MIT | unit/integration/e2e; extend existing `hub/e2e` |
| a11y lint | **eslint-plugin-jsx-a11y + axe** | MIT | WCAG 2.2 AA per skill |

**Explicitly NOT adding:** Redux, a WebSocket lib, a CSS-in-JS runtime, a component
kit (MUI/Chakra — they'd fight the hub's bespoke dark theme and bloat the bundle), or
any paid/cloud SDK. Everything stays OSS-first per the framework's no-lock-in rule.

---

## 8. The explicit "MVP that keeps the zero-dep hub working" option

This is a first-class deliverable, not a footnote:

- **`hub/public/index.html` stays in the repo and stays served** by Core at `/legacy`
  (and remains the bare-`node hub/server.js` experience for single-project users).
- It is the **fallback MVP**: anyone can run the existing zero-dependency hub today,
  with no build step, and get a live single-project board. The React shell is
  **additive** — it does not delete the floor.
- **Phase 1** delivers the React Tasks board as a *parity* replacement for that file
  on a single project, proven equal by snapshot tests against the vanilla output —
  so we can flip the default `/` from vanilla to React **only when parity is proven**,
  and keep `/legacy` as the safety net.
- If at any point the React shell is blocked (e.g. Tauri sidecar packaging, Jorge R4),
  **the product still has a working browser MVP** — the zero-dep hub — to demo and
  ship. This directly de-risks the whole vision and matches Apex's "productize the
  Hub" and Anna's "extends rather than rebuilds."

---

## 9. Risks (FE-specific) & open questions

| # | Risk / question | Severity | Mitigation / who |
|---|---|---|---|
| F1 | React Flow transform/animation perf on **WKWebView** (the live token + 50+ nodes) | High | Spike a 50-node canvas + token anim on macOS WKWebView in Phase 4 before committing to anim richness (Jorge R8) |
| F2 | **Lossless round-trip** (graph ↔ `workflow.graph.json`) silently breaks | High | Property test serialize∘parse = identity, in CI from Phase 4 (AC-C4.2) |
| F3 | **Keyboard a11y** for node-connect (WCAG 2.5.7) is non-trivial with React Flow's pointer model | Med | Budget explicit time; ship the accessible list-view alternative regardless |
| F4 | **Status-derivation regression** during the vanilla→React port (blocked-by-hard-gate rule) | Med | Snapshot tests against current vanilla output before porting (§1.4) |
| F5 | **Browser host can't read arbitrary folder paths** for "connect a project" | Med | Bridge: browser uses host-known project or user-typed path; native picker only in Tauri/IDE (AC-A1, AC-F1.2) |
| F6 | **Per-project SSE fan-out** (N connections) resource use with many projects | Low-Med | MVP is few projects; move to multiplexed Core stream (Option B §4.2) when needed |
| F7 | **Bundle creep** from React Flow on non-workflow routes | Low | Route-level code splitting; Workflow is its own async chunk |
| F8 | **Remote-write auth** layering (token on top of `X-AIDT`) not yet specified server-side | Med | Coordinate with /be + /secops; FE bridge ready to attach a bearer; guard already refuses remote writes by default |

**Open questions for /po + /arch (echoing Aura §13 / Anna §7):**
1. Is the Workflow **builder (editing)** v1, or read-only-first (Anna's MVP defers
   editing)? This moves Phases 4–5 in/out of v1. *FE assumes read-only render in the
   thin MVP, full editing as fast-follow — matching Anna.*
2. Confirm **React Flow** as the one new dependency (Aura's open Q4) — *FE strongly
   endorses; nothing else comes close for the cost.*
3. Single-project-flawless first (Apex) vs. multi-project shell in MVP (Anna/Jorge)?
   *FE plan supports both: Phase 1 is single-project (the Apex cut); Phase 2 adds the
   shell — no rework, just wrapping.*
4. Remote-write token scheme — needs a /be + /secops contract before Phase 2 remote
   work.

---

## 10. One-paragraph summary

Move to **React 19 + Vite + TypeScript** because the workflow builder requires **React
Flow** (the single endorsed new dependency), but **keep the zero-dependency
`index.html` hub alive as the served fallback MVP** so the product always has a
working demo and a graceful-degradation floor. Lift the hub's already-correct
presentation logic — status derivation, gate chips, agent badges, the comment
timeline, the SSE diff→toast engine, and the entire dark theme — into typed React
components, locked against regression by snapshot tests. Serve **one bundle to three
hosts** (Tauri WebView, browser, IDE webview) behind a thin `PlatformBridge` that
isolates transport, folder-picker, and secure-storage; everything else is identical.
Reuse the hub's **SSE** for realtime (no WebSockets for MVP) with per-project
multiplexing, **TanStack Query + Zustand** for lean state, and the server's existing
**CAS `expectedRev` 409 reconcile** for safe optimistic writes. Ship in phases —
**Tasks first** (highest value, ~80% already exists), then Base, then the Workflow
builder, then live-run trace, then the Conveyor — each buildable by one developer,
each OSS-first with zero paid dependencies.
