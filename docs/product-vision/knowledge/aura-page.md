# Design Spec — Dedicated Knowledge Page (DART)

**Designer:** Aura (`/ui`)
**Date:** 2026-06-13
**Status:** Draft → In Review (awaiting `/po`)
**Scope:** A full **Knowledge PAGE** for a project, reached from the shell the same way the Tasks board ("Open board") and the Workflow builder ("Edit workflow") are. Manages knowledge with CRUD (add / edit / remove) + connect-an-external-codebase, keeps the `/kai` propose-inbox and the Q&A, and designs the **seam** that lets the page show a connected **Canon** (external governed KB) overlay later while the open-source default stays a simple local store (files / SQLite).
**Stack constraint:** Angular 21, standalone, OnPush. **Inline SVG only — no icon library.** Dark-first, `--kb-*` tokens, WCAG 2.2 AA. No `[innerHTML]`. All untrusted text (doc names, bodies, tags, source paths, overlay answers) renders via interpolation only (escaped). This is design only — no production code.

> **Wireframe glyph convention (READ FIRST — for `/fe`):** the ASCII mocks use placeholder symbols and quoted glyph *names* to mark where an inline-SVG glyph goes. The repo's `no-tofu-glyphs` source-scan forbids the literal symbols `＋ ◧ ‹ › ▯ ✎ ⚙` (and any non-typographic non-ASCII) in component source. **Do NOT paste a wireframe symbol into a template** — every icon position resolves to a glyph from the existing `dart-glyph` catalogue (§7). The mocks are diagrams, not markup.

---

## 0. Grounding — what exists today (inspected live in source)

- **Knowledge is a side PANEL** today: `base-panel.component.ts` (selector `dart-base-panel`), one of three summary panels in `project-shell.component.ts`. It shows scope segments (This project / Common / All) with counts, stack + kind filters, an honest method line, a doc list (each row: name + scope badge + stack chips + kind + index label), the `/kai` propose-inbox (`dart-propose-inbox`), the Q&A (`dart-knowledge-qa`), an **Add knowledge** live form (`dart-add-note-form`), and a **"Manage knowledge"** footer button that is deliberately an inert `disabled` / `aria-disabled` "soon" affordance. **This page is the destination that "soon" button promises.**
- **The two existing full-page views are the pattern to copy.** Both are reached from a panel footer button (`tasks-open-board`, the builder's open) and rendered in-shell by `project-shell.component.ts`: `boardOpen()` / `builderOpen()` swap the 3-panel grid for a `<section class="board-view">` carrying a **`board-view__head`** (a `board-view__back` "Back to panels" button + a `board-view__title`) and the full component. They are **NOT routes** — they are in-shell view modes over the same live `state`, so an SSE push re-derives them in place. The Knowledge page follows this exact mechanism.
- **CRUD primitives already exist on the wire** — except edit/remove:
  - **Add** → `ControlPlaneService.addKbNote()` → `POST /api/kb/add` (title, body, scope enum, stack, kind; server slugs the filename — client never sends a path). Returns fresh `state` + the `doc` actually written.
  - **Edit / Remove** → **do not exist yet** (`/be` must add `kb/update` + `kb/remove`; see §9). The design specifies their UI + the guard/confirm contract so `/be` builds to it.
  - **Propose approve/reject** → `approveProposal()` / `rejectProposal()`.
  - **Ask** → `askKnowledge()` → `GET /api/knowledge/ask` (read-only; egress disclosed truthfully).
- **The Canon-overlay seam already exists in the type system.** `KnowledgeAnswer` carries `egressDisclosed`, and `KnowledgeGrounding` carries `method` (`overlay | semantic | filename-only | none`), `external`, `residency`, and a backend-authored verbatim `label`. The Q&A already renders an egress line ONLY when `egressDisclosed` is true. **This is the ADT-236 honesty contract** — the page reuses it for the connected-source overlay rather than inventing a second egress path.

**Honouring the canon:** status / source = **colour + glyph + text** (never colour alone); accent reserved for live/primary; surfaces by elevation not heavy shadow; focus ring `--kb-focus-ring` 2px; `prefers-reduced-motion` respected; `--kb-*` tokens only.

---

## 1. SKEPTICAL FRAME — what this page should and should NOT be

Before the layout, the honest scoping decisions, because the user asked for full skepticism:

1. **This is a management page, not a second knowledge store.** Everything it shows is the SAME merged `KnowledgeView` the panel shows (`state.knowledge`). The page adds *editing* and *connecting* — it does not introduce a parallel model. The panel stays as the at-a-glance summary; the page is "Manage knowledge".
2. **Resist building a Canon UI now.** The user said "build with Canon in mind" AND "keep it simple for open-source". The skeptical reading: design the **seam** (a connected-source strip + the overlay reusing the existing egress-honesty fields) and **nothing more**. No Canon policy editor, no provenance browser, no RBAC panel — those live in Canon's own UI (kb.localhost). DART shows *that an overlay is connected, what residency, and discloses egress* — full stop. Over-building Canon UI here would be the classic gold-plating trap.
3. **"Connect an external codebase" is mostly a backend job with a thin UI.** The honest amount of UI is: a **connect action** (point at a folder via the existing folder-picker dialog), a **connected-source row** (path + status + honest index label + disconnect), and a **re-index** action. NOT a file tree, NOT per-file index toggles, NOT a crawl-config wizard. The folder-picker dialog already exists (`folder-picker.component.ts`, `FsService`, `/api/fs/*`) — reuse it; do not build a second directory browser.
4. **Edit + Remove must be SAFE, not slick.** A knowledge note is a rule the AI team follows; deleting one silently changes team behaviour. Remove is a typed confirm (name echoed); edit is a guarded CAS write (so two sessions can't clobber). No drag-to-delete, no swipe gestures.
5. **Local-simple is the default and must never *look* degraded.** When no overlay and no embedder are wired (the OSS default), the page is fully functional with a filename index — the method line says so honestly. The Canon/overlay affordances are an *additive* strip that is **absent** (not a disabled tease) until an overlay is configured.

---

## 2. The page layout — regions

The page is `dart-knowledge-page` (new component), rendered by `project-shell.component.ts` under a new `knowledgeOpen()` view-mode, mutually exclusive with `boardOpen()` / `builderOpen()` (the shell already enforces this pattern — opening one closes the others). It binds the live `state` and emits `applied(state)` exactly like the board.

```
┌─ shell: board-view__head ─────────────────────────────────────────────────────┐
│ ‹ Back to panels        Knowledge                                              │  reuse board-view__head verbatim
└────────────────────────────────────────────────────────────────────────────────┘

KNOWLEDGE PAGE BODY (max-width 76rem, the shell-body width)

┌─ A. PAGE TOOLBAR (sticky-top within body) ────────────────────────────────────┐
│ [glyph base] Knowledge   24 notes              [ search… ⌕ ]   [ ＋ Add note ] │
│ ─────────────────────────────────────────────────────────────────────────────│
│ Scope:( This project 18 )( Common 6 )( All 24 )   Stack:[any▾]  Kind:[all▾]   │
│ Source: [● Local files]  [○ Canon — kb.localhost]   ← only when overlay present │
│ Indexed via: local embeddings (semantic)            ← honest method line        │
└────────────────────────────────────────────────────────────────────────────────┘

┌─ B. CONNECTED SOURCES STRIP (absent-not-zero) ────────────────────────────────┐
│ Connected codebases & sources                              [ ＋ Connect… ]    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [glyph folder-stack] payments-api/src   ● indexed · 142 files · filename  │ │
│ │   /home/oleh/git/workspace/payments-api/src        [ Re-index ] [ ⋯ ]     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘

┌─ C. PROPOSE-INBOX (absent-not-zero) ──────────────────────────────────────────┐
│ [glyph propose] Proposed knowledge   from /kai          3 pending             │
│ … existing dart-propose-inbox, unchanged …                                    │
└────────────────────────────────────────────────────────────────────────────────┘

┌─ D. DOC LIST (the main region — a worklist of notes) ─────────────────────────┐
│ Notes (18 in this scope)                                                       │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ code-rules                          [Project] [tag java] [rule]  ✎  🗑      │ │
│ │ Use constructor injection; never field @Autowired. Keep services…  indexed │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ test-policy                         [Common] [tag any] [style]   ✎  🗑      │ │
│ │ Every behaviour gets a failing test first (TDD). >80% unit…        indexed │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘

┌─ E. ASK PANEL (the Q&A, pinned to the right on wide / below on narrow) ────────┐
│ [glyph search] Ask the knowledge base                                          │
│ … existing dart-knowledge-qa, unchanged (already overlay/egress-honest) …      │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Region order rationale (top → bottom):** toolbar (orient + act) → connected sources (the new connect affordance, high but secondary) → propose-inbox (pending decisions need attention before browsing) → doc list (the work) → ask (a tool you reach for, not the first thing). On `≥lg` the doc list (D) and ask (E) sit **side-by-side** (D ~62%, E ~38%, sticky) so asking and browsing coexist; on `<lg` E stacks under D. Connected-sources (B) and inbox (C) are full-width above the split.

**Layout grid:** reuse `.shell-body` width (`max-width: 76rem`). Regions stack with `gap: var(--kb-space-4)`. The D/E split is a `grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 1fr)` collapsing to one column under `--kb-bp-lg` via a container/media query — same `repeat(auto-fit, minmax(...))` family the shell already uses.

---

## 3. The DOC LIST — note rows with inline edit/remove

This is the densest region. It reuses the **worklist card grammar** (a list of rows, each scannable, each carrying chips), aligned with the Tasks board's `.card` look but lighter (a note has no lifecycle). Each row:

```
┌─ note row (button-less body is read; actions are explicit) ───────────────────┐
│ ROW HEADER:                                                                    │
│   code-rules                       [scope badge] [stack chips] [kind]  [✎][🗑] │
│ ROW BODY (2-line clamp of the markdown body, plain escaped text):              │
│   Use constructor injection; never field @Autowired. Keep services thin…       │
│ ROW FOOTER (muted):                                                            │
│   [scope-project glyph] Project · indexed via filename · edited 2d ago          │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Name** — `doc.name`, mono-ish weight 600, `overflow-wrap: anywhere` (untrusted slug).
- **Chips** — reuse the panel's chip grammar exactly: scope badge (glyph + "Project"/"Common", `chip--common` accent for common), stack chips (`tag` glyph + text, `any` dropped when specifics exist — reuse `docStack()`), kind chip (capitalised). Colour reinforces the glyph + text, never alone.
- **Body preview** — a **2-line clamp** of the note body (`-webkit-line-clamp: 2`), escaped, `overflow-wrap: anywhere`. Requires `/be` to include a short `excerpt`/`body` on the doc projection (§9.1) — today `KnowledgeDoc` has no body. If absent, the row simply omits the preview line (graceful — name + chips still scan).
- **Index label** — `doc.index ?? 'indexed'`, in the muted footer, never overstated.
- **`✎` edit** — opens the **editor drawer** (§4) pre-filled with this note. Icon button ≥24px (`glyph: edit`), `aria-label="Edit {name}"`.
- **`🗑` remove** — opens the **remove confirm** (§5). Icon button ≥24px (`glyph: trash`), `aria-label="Remove {name}"`, hover/focus tints `--kb-danger` (danger is reinforced by the trash glyph + the confirm copy, never colour alone).
- **Whole row is NOT a link** — unlike the project card, a note row's primary content is reading the body; the two actions are explicit buttons. (Tasks cards open a detail because a ticket *is* a workflow object; a note is just text + tags, so inline edit/remove beats a modal-per-note.)

**Search/filter (region A toolbar):**
- **Search** — a client-side text filter over `doc.name` + (when present) the body excerpt. Debounced, no round-trip (the merged view is already loaded — same philosophy as the panel's client-side stack/kind filters). `data-testid="kb-search"`, `type="search"`, `aria-label="Search notes"`. Clearing returns the full scope list.
- **Scope segments** — reuse the panel's `role="radiogroup"` scope control verbatim (This project / Common / All, with counts, roving arrows). Same `SCOPE_ORDER`, same a11y.
- **Stack / Kind selects** — reuse the panel's `filters__sel` selects verbatim.
- **Combined empty** — when search + filters match nothing: "No notes match these filters." + a **Clear filters** button (so the user is never stuck staring at zero). Distinct from the genuine empty state (§6).

---

## 4. ADD / EDIT — the editor drawer

Add and edit share ONE editor component (`dart-note-editor`) — a right-side **drawer** (slide-in sheet, the SKILL's modal pattern) so the doc list stays visible behind it. It is the existing `dart-add-note-form` generalised to also edit.

```
┌─ EDITOR DRAWER (role=dialog, aria-modal, focus-trapped, Esc closes) ───────────┐
│ [glyph add-comment] Add knowledge                                        ✕    │   header (✕ = glyph cross)
│  (or)  [glyph edit] Edit: code-rules                                          │
│ ─────────────────────────────────────────────────────────────────────────────│
│ [glyph info] Saves a markdown file on this machine — nothing is uploaded.      │   honest local-write line
│                                                                                │
│ Title *                                                                        │
│ [ code-rules                                                    ]   18 / 200   │
│                                                                                │
│ Body (markdown) *                                                              │
│ ┌────────────────────────────────────────────────────────────────────────┐   │
│ │ Use constructor injection; never field @Autowired…                      │   │
│ └────────────────────────────────────────────────────────────────────────┘   │
│ 312 B / 64 KB                                          ▸ Preview (escaped pre) │
│                                                                                │
│ Scope:  ( This project )( Common )      ← fixed enum radiogroup                 │
│   ⓘ Common is shared across your own projects on this machine — never a cloud. │
│ Stack: [java ▾]     Kind: [rule ▾]                                             │
│                                                                                │
│ [glyph info] Saved as a filename-indexed note (no semantic embedding).         │   honest index preview
│ ───────────────────────────────────────────────────────────────────────────── │
│                                                  [ Cancel ]  [ 💾 Save note ]   │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Reuse `dart-add-note-form` wholesale** — every control, validation (title ≤200, body ≤64 KB UTF-8 measured, escaped preview), the scope radiogroup with the Common hint, the honest index preview, the fixed-enum scope, the friendly error mapping. It already enforces the security contract (no path, escaped preview).
- **Edit mode adds:** a `note` input (the `KnowledgeDoc` being edited). When present: header reads "Edit: {name}", fields pre-fill from the note (title + body + scope + stack + kind), the primary button is "Save note", and **submit calls `kb/update` with the note's id/file + the current `rev`** (a guarded CAS, §9.2) instead of `kb/add`. **Scope change on edit = a move between vaults** — the server handles it; the UI states "Moving from Project to Common" inline when the scope radio changes from the loaded value, so a re-scope is never silent.
- **Add mode** is today's form unchanged.
- **Why a drawer, not the panel's inline form:** on a full page there is room for a focus-trapped editor that keeps the list as context; the inline-form-in-footer pattern was a side-panel compromise.
- **Optimistic + conflict:** edit rides the guarded control plane with `expectedRev`; a 409 surfaces an inline "This note changed elsewhere — reloaded." and the drawer re-fills from fresh state (mirrors the board's conflict contract). Add is additive (no rev), as today.

---

## 5. REMOVE — the safe confirm

Remove is a small centred confirm dialog (not a drawer — it's a yes/no), focus-trapped, default focus on **Cancel** (destructive default never auto-focused).

```
┌─ REMOVE CONFIRM (role=alertdialog, aria-modal, Esc = Cancel) ──────────────────┐
│ [glyph trash] Remove this note?                                                │
│                                                                                │
│ “code-rules” (Project) will be deleted from this machine. Your AI team will    │
│ stop following it. This can't be undone.                                       │
│                                                                                │
│                                              [ Cancel ]   [ 🗑 Remove note ]    │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Name + scope echoed** in the body (escaped) so you confirm the *right* note.
- **Honest consequence copy:** "Your AI team will stop following it" — states the behavioural effect, not just "are you sure".
- **Destructive button** is `--kb-danger`-filled with the trash glyph + "Remove note" text (colour + glyph + text). **Cancel holds initial focus.**
- **Removes via `kb/remove { id/file, expectedRev }`** (guarded CAS, §9.3) → adopts fresh `state`; the row leaves the list and the count decrements from that single source of truth. A 409 → "This note changed elsewhere — refresh." (no blind delete).
- **No bulk delete in this slice** — one note at a time. (Bulk is a future ask; the skeptical default is to not hand users a one-click way to wipe the team's rules.)

---

## 6. CONNECT-AN-EXTERNAL-CODEBASE

The honest, minimal affordance. **Connecting a codebase = registering a folder as an indexed knowledge source.** The page does NOT crawl files into the note list; it registers the source and shows its index status. Searching/asking then includes that source (the backend owns the index).

### 6.1 The connect action + dialog (reuse the folder picker)

The **`＋ Connect…`** button in region B opens the **existing folder-picker dialog** (`folder-picker.component.ts`) — the same Core directory browser the Connect-a-project flow uses (`/api/fs/list`, `/api/fs/roots`). The user navigates to a folder and confirms; the page calls a new `kb/source/connect { path, expectedRev }` (§9.4). **No new picker is built.**

```
ON CONNECT → the source row appears in B in an "indexing" state:

┌──────────────────────────────────────────────────────────────────────────────┐
│ [glyph folder-stack] payments-api/src     ◐ indexing… · 142 files found        │
│   /home/oleh/git/workspace/payments-api/src                       [ Cancel ]   │
└──────────────────────────────────────────────────────────────────────────────┘

→ settles to:

┌──────────────────────────────────────────────────────────────────────────────┐
│ [glyph folder-stack] payments-api/src     ● indexed · 142 files · filename     │
│   /home/oleh/git/workspace/payments-api/src         [ Re-index ]  [ ⋯ ]        │
└──────────────────────────────────────────────────────────────────────────────┘
                                                          ⋯ menu: Disconnect
```

### 6.2 What the source row shows (and only this)

- **Label** — the folder basename (`folder-stack` glyph). Path echoed below, muted, `overflow-wrap: anywhere` (untrusted).
- **Status** — `● indexed` / `◐ indexing…` / `⚠ index failed` (glyph + colour + text). Reuse `--kb-success` / `--kb-warning` / `--kb-danger`.
- **Honest index label** — "{n} files · filename" or "{n} files · semantic" — **the same honesty as the note method line**: it never says "semantic" unless an embedder is genuinely wired. A failed source says "⚠ index failed — {reason}" + Re-index.
- **Re-index** — re-runs the index (`kb/source/reindex`). Disabled while indexing.
- **`⋯` → Disconnect** — a confirm ("Disconnect {label}? Its files stop being searchable here. The folder itself is untouched."). Disconnect removes the *registration*, never the user's files — the copy says so.

### 6.3 Skeptical decision: how much UI?

**This much and no more.** No file tree, no per-file toggles, no include/exclude globs in this slice, no crawl schedule. A connected codebase is "a folder DART indexes for search/ask". If `/be` later supports ignore-globs, the `⋯` menu gains an "Index settings…" item — but the v1 is connect / status / re-index / disconnect. Building a crawl-config UI now is gold-plating an unproven need.

### 6.4 Empty state of region B

When no source is connected, region B is **absent** by default (no empty card). It surfaces only its header + the `＋ Connect…` button inside a single quiet line in region A's overflow? — No: keep one always-available **`＋ Connect…`** entry. Decision: region B renders as a **single quiet invitation row** when empty (so the affordance is discoverable), not a full empty card:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [glyph folder-stack] Connect a codebase to make it searchable here.  [Connect]│
└──────────────────────────────────────────────────────────────────────────────┘
```

This is the one place we *do* show an empty-affordance (vs absent) because the connect feature is otherwise undiscoverable — but it's one calm line, not a hero.

---

## 7. THE CANON-OVERLAY SEAM (enterprise path) vs LOCAL-SIMPLE (open-source)

The whole point of the dogfood. The page is **fully functional on the local-simple store** and **gains an overlay strip** when an external governed KB (Canon, or any ADT-236 memory overlay) is configured. The seam is deliberately thin.

### 7.1 The principle: local is truth, overlay is an additive, disclosed source

- **Default (OSS):** `Source` shows only **`● Local files`**. Notes live as markdown in vaults (or SQLite — see §8). Method line is local ("filename index" or "local embeddings"). Nothing about Canon appears. This is the shipped default and looks complete.
- **Overlay configured (enterprise / dogfood):** the toolbar **`Source` control** gains a second segment — **`○ Canon — kb.localhost`** (the overlay's name + residency, from the grounding fields). It is a *filter/source toggle*, not a second store:

```
Source: ( ● Local files 24 )  ( ○ Canon · kb.localhost )      ← appears only when overlay present
        ↑ default selected, always present       ↑ external, egress-disclosed when queried
```

### 7.2 How the overlay is disclosed (reuse ADT-236 honesty verbatim)

- **The connected-source strip (B) is where a Canon connection lives** — a Canon overlay is just another connected source row, but marked **external**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [glyph cloud] Canon — governed knowledge       ● connected · kb.localhost      │
│   External service · queries leave this machine when you ask Canon   [ ⋯ ]     │
│                                                  ⋯ menu: Disconnect · Open Canon│
└────────────────────────────────────────────────────────────────────────────────┘
```

  - **`cloud` glyph** (the same glyph the Q&A uses for egress) marks it external, distinct from the local `folder-stack` codebase rows.
  - **Residency line is verbatim from the grounding/config** (`kb.localhost` is a local-service residency; a hosted Canon would say so). The UI **never paraphrases a stronger privacy claim** than the backend reports — same rule the Q&A already follows.
  - **"Open Canon"** deep-links to `kb.localhost` (the Canon UI owns policy/provenance/RBAC — DART does not reimplement them).
- **When you ask (region E) and the answer came from Canon:** the existing `dart-knowledge-qa` **already** renders the egress line driven solely by `egressDisclosed`, names the residency, and shows the grounding label verbatim. **No change needed** — the seam is the data, and it's already wired. When you search/browse the doc list with the Canon source selected, the list shows overlay-returned items tagged with an **`overlay` scope badge** (the model already allows `scope: 'overlay'` on `KnowledgeMatch`), each carrying "from Canon" + the disclosure that browsing this source is an external read.

### 7.3 What DART does NOT build for Canon (the skeptical line)

- No policy/obligate-read editor, no provenance/lineage browser, no per-token cost receipts UI, no RBAC management — all of that is **Canon's own UI** at kb.localhost. DART links out.
- DART's entire Canon surface is: **(a)** a source row marking it external + residency, **(b)** the Source toggle in the toolbar, **(c)** the already-built egress disclosure on ask/browse. That is the seam — additive, honest, and small.
- **Write-through is out of scope for v1.** Adding/editing/removing notes writes to the **local** store; whether a note also publishes to Canon is a governed action Canon owns and is a later ticket. The Add/Edit drawer's "saves on this machine" copy stays true. (If/when write-through lands, the drawer gains an explicit "Also publish to Canon (governed)" disclosed checkbox — not now.)

### 7.4 Why this seam survives the dogfood

Because the overlay is modelled as *just another connected source* sharing the *same egress-honesty fields the Q&A already consumes*, swapping the OSS filename index for Canon's MCP-backed governed answers is a **backend wiring change**, not a UI rebuild. The page's regions, CRUD, and disclosure all hold. That is the "build with Canon in mind, ship simple for OSS" requirement met at the seam, not by over-building.

---

## 8. LOCAL-SIMPLE STORE: files vs SQLite (the UI is storage-agnostic)

The user prefers SQLite for the local store. **The page does not care** — it binds the merged `KnowledgeView` projection regardless of whether `/be` reads markdown vaults or a SQLite table. Two honesty rules the UI keeps either way:

- **The "saves a markdown file on this machine" copy** in the add/edit drawer is the one place storage leaks into the UI. If `/be` moves to SQLite, that line becomes **"saves to this project's local knowledge store — nothing is uploaded."** (storage-neutral, still honest). Flagged for `/be` to confirm the wording matches reality.
- **The method line stays honest** to the *index*, not the *store*: "filename index" vs "local embeddings (semantic)" describes recall capability, orthogonal to files-vs-SQLite. SQLite with FTS5 could honestly say "local full-text index" — a third honest method value `local-fts` the line should support (§9.1).

No other UI changes between files and SQLite. This is intentional: the storage choice is a backend concern behind the projection.

---

## 9. NEW BACKEND DATA + ENDPOINTS (for `/be`, gated by `/arch` + `/secops`)

The page needs these beyond what exists. Each is behaviour-only here; the team gates them.

### 9.1 Doc projection carries a body excerpt + a richer index method
Extend `KnowledgeDoc` with an optional **`excerpt`** (or `body`, server-capped ~280 chars, escaped on render) so the row preview works; absent → row omits the preview. Allow `KnowledgeView.method` to also be **`local-fts`** (SQLite full-text) and **`overlay`** so the method line and source strip stay honest across stores.

### 9.2 Edit endpoint — `POST /api/kb/update`
`{ id | file, title, body, scope, stack, kind, expectedRev }` → guarded CAS write; the server re-validates (same caps as add), handles a scope change as a vault move, returns fresh `state`. 409 on stale `rev`. **Never accepts a path** — addresses the note by its server-known id/file, like add slugs server-side.

### 9.3 Remove endpoint — `POST /api/kb/remove`
`{ id | file, expectedRev }` → guarded CAS delete; returns fresh `state`. 409 on stale rev. Audited (retain a tombstone for the ledger, like a rejected proposal is retained).

### 9.4 Connect-source endpoints (the codebase indexing)
```
POST /api/kb/source/connect    { path, expectedRev }   → registers + starts indexing
POST /api/kb/source/reindex    { sourceId, expectedRev }
POST /api/kb/source/disconnect { sourceId, expectedRev }
GET  (via state)  state.knowledge.sources: [{ id, label, path, kind:'codebase'|'overlay',
                    status:'indexed'|'indexing'|'failed'|'connected', fileCount?, method, residency?, external }]
```
- **Reuses the `/api/fs/*` picker** for choosing the folder — no new browser.
- **Security (critical, `/secops` hard gate):** path resolved + realpathed + confined to allowed roots exactly as `/api/fs/list` already is; the write-guard header required; `path` / `label` / `residency` are UNTRUSTED on render (escaped). An `overlay` source's residency + external flag come from the overlay config, surfaced read-only.
- **`external: true`** drives the `cloud` glyph + the egress disclosure; a local codebase source is `external: false`. This keeps the disclosure data-driven (cannot drift), reusing the ADT-236 contract.

### 9.5 Overlay presence flag
`state.knowledge` (or a config read) exposes whether an external overlay is **configured + enabled + healthy** so the toolbar `Source` toggle and the overlay source row appear ONLY then (absent otherwise — never a disabled tease). Mirrors the Q&A's existing rule that egress happens only when an overlay is configured + healthy.

---

## 10. STATES — loading / empty / quiet / error (honest, never bare)

| Surface | Loading | Empty (honest) | Error |
|---|---|---|---|
| Page body | region skeletons (toolbar bar + 4 row skeletons in D) | — | "Couldn't open knowledge: {err}" banner (isolated per region) |
| Doc list (D) | 4–6 shimmer note rows (static stripe under reduced-motion) | **whole-empty:** "No knowledge yet — add the rules and context your team must follow." + the **＋ Add note** button (never bare "No data") | "Couldn't load notes." (region-local) |
| Doc list — filtered | — | "No notes match these filters." + **Clear filters** | — |
| Doc list — common scope empty | — | "No common knowledge yet — add a shared note, or promote a project note." (reuse panel copy) | — |
| Connected sources (B) | row skeleton while a connect is in flight | one quiet **Connect a codebase…** invitation line (§6.4) | per-row "⚠ index failed — {reason}" + Re-index |
| Propose-inbox (C) | — | **absent** (not a zero state) — unchanged | per-card error (existing) |
| Ask (E) | "Asking the knowledge base…" (existing) | idle (no answer yet) — unchanged | "Couldn't reach the knowledge base — try again." (existing) |
| Editor drawer | "Adding note…" / "Saving…" | — | inline friendly error (existing mapping) + 409 reconcile |
| Remove confirm | button → spinner glyph + "Removing…" | — | "This note changed elsewhere — refresh." |

**A region error is isolated** — one region failing never blanks the others (the shell already derives each panel behind its own guard; the page mirrors this per region).

---

## 11. ASCII MOCKS

### 11.1 Page — POPULATED (wide ≥lg)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Back to panels        Knowledge                                                            │
└───────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ toolbar ─────────────────────────────────────────────────────────────────────────────────┐
 │ [base] Knowledge  24 notes                          [ ⌕ search notes…        ]  [ ＋ Add note ]│
 │ ───────────────────────────────────────────────────────────────────────────────────────── │
 │ Scope: ( This project 18 )( Common 6 )( All 24 )    Stack:[any▾]  Kind:[all▾]              │
 │ Source: ( ● Local files )( ○ Canon · kb.localhost )   Indexed via: local embeddings (semantic)│
 └────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ connected sources ───────────────────────────────────────────────────────────────────────┐
 │ Connected codebases & sources                                              [ ＋ Connect… ] │
 │ ┌───────────────────────────────────────────────────────────────────────────────────────┐ │
 │ │ [folder-stack] payments-api/src     ● indexed · 142 files · filename                    │ │
 │ │   /home/oleh/git/workspace/payments-api/src                      [ Re-index ]  [ ⋯ ]    │ │
 │ ├───────────────────────────────────────────────────────────────────────────────────────┤ │
 │ │ [cloud] Canon — governed knowledge  ● connected · kb.localhost                          │ │
 │ │   External service · queries leave this machine when you ask Canon            [ ⋯ ]     │ │
 │ └───────────────────────────────────────────────────────────────────────────────────────┘ │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ proposed (from /kai) ─────────────────────────────────────────────────────────────────────┐
 │ [propose] Proposed knowledge   from /kai                                        3 pending   │
 │  …existing inbox cards (Approve as Project / Common)…                                       │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ DOC LIST (62%) ───────────────────────────────────────┐ ┌─ ASK (38%, sticky) ────────────┐
 │ Notes (18 in this scope)                                │ │ [search] Ask the knowledge base │
 │ ┌─────────────────────────────────────────────────────┐│ │ Check what DART holds on a topic│
 │ │ code-rules            [Project][tag java][rule] ✎ 🗑 ││ │ [ how do we retry webhooks?  ] ⌕│
 │ │ Use constructor injection; never field @Autowired…  ││ │ ─────────────────────────────  │
 │ │ Project · indexed via filename · edited 2d ago      ││ │ (answer renders here, with the │
 │ ├─────────────────────────────────────────────────────┤│ │  honest grounding label + the  │
 │ │ test-policy           [Common][tag any][style]  ✎ 🗑 ││ │  egress line ONLY when Canon   │
 │ │ Every behaviour gets a failing test first (TDD)…    ││ │  actually answered)            │
 │ │ Common · indexed via filename · edited 5d ago       ││ │                                │
 │ └─────────────────────────────────────────────────────┘│ └────────────────────────────────┘
 └─────────────────────────────────────────────────────────┘
```

### 11.2 Page — EMPTY (no notes, no sources, no proposals — the OSS first-run)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Back to panels        Knowledge                                                            │
└───────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ toolbar ─────────────────────────────────────────────────────────────────────────────────┐
 │ [base] Knowledge                                                              [ ＋ Add note ]│
 │ ───────────────────────────────────────────────────────────────────────────────────────── │
 │ Indexed via: filename index only — connect an embedder for semantic recall                 │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ connected sources ───────────────────────────────────────────────────────────────────────┐
 │ [folder-stack] Connect a codebase to make it searchable here.                  [ Connect ] │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ DOC LIST ─────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                            │
 │        No knowledge yet — add the rules and context your team must follow.                 │
 │                              [ ＋ Add note ]                                                │
 │                                                                                            │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
```
(Scope segments + stack/kind selects are hidden while empty — they have nothing to filter, mirroring the panel's `isEmpty()` behaviour. The Ask panel is also hidden until at least one note exists, mirroring the panel's "Q&A only when not empty".)

### 11.3 EDITOR DRAWER — EDIT mode

```
                                          ┌─ drawer (slides from right) ─────────────────────┐
                                          │ [edit] Edit: code-rules                      ✕   │
                                          │ ─────────────────────────────────────────────── │
                                          │ [info] Saves to this project's local store —     │
                                          │        nothing is uploaded.                      │
                                          │ Title *                                          │
                                          │ [ code-rules                          ] 10 / 200 │
                                          │ Body (markdown) *                                │
                                          │ ┌──────────────────────────────────────────────┐ │
                                          │ │ Use constructor injection; never field       │ │
                                          │ │ @Autowired. Keep services thin and testable. │ │
                                          │ └──────────────────────────────────────────────┘ │
                                          │ 312 B / 64 KB                       ▸ Preview     │
                                          │ Scope: ( ●This project )( Common )               │
                                          │ Stack: [ java ▾ ]    Kind: [ rule ▾ ]            │
                                          │ [info] Saved as a filename-indexed note.         │
                                          │ ─────────────────────────────────────────────── │
                                          │                       [ Cancel ]  [ 💾 Save note ]│
                                          └──────────────────────────────────────────────────┘
```

### 11.4 CONNECT — folder-picker dialog (reused) → source row appears

```
┌─ Choose a folder to index ───────────────────────────────────────────────  ✕ ┐
│ ⌂ Home  ›  oleh  ›  git  ›  workspace                                          │
│ [ ⟵ Up ]                                              ⌕ filter folders…        │
│ ───────────────────────────────────────────────────────────────────────────  │
│   ▸ 📁 payments-api                                                            │
│   ▸ 📁 marketing-site                                                          │
│ ───────────────────────────────────────────────────────────────────────────  │
│ Selected: /home/oleh/git/workspace/payments-api/src                           │
│                                                       [ Cancel ] [ Connect ]   │
└────────────────────────────────────────────────────────────────────────────────┘
   → on Connect, dialog closes; region B shows the new row in ◐ indexing… then ● indexed.
```

---

## 12. ACCESSIBILITY (WCAG 2.2 AA)

- **Colour never alone:** every source status (indexed/indexing/failed/connected), every scope/kind/stack chip, the external-vs-local distinction (`cloud` vs `folder-stack` glyph), and the destructive remove all pair **glyph + text**. External/egress is the `cloud` glyph + an explicit residency sentence, never hue alone.
- **Editor drawer + confirms:** `role="dialog"` (editor) / `role="alertdialog"` (remove), `aria-modal`, **focus trapped**, `Esc` closes, focus **returns** to the `✎`/`🗑`/`＋` button that opened it (the board already does this return-focus pattern via a remembered trigger testid). Remove dialog's **initial focus is Cancel**, never the destructive button.
- **Doc list semantics:** an `<ul aria-label="Knowledge notes">` of `<li>` rows; the `✎`/`🗑` are real `<button>`s with `aria-label="Edit {name}"` / `"Remove {name}"`.
- **Search:** `<input type="search">` with `aria-label`; results count announced via `aria-live="polite"` ("18 notes" → "3 notes match").
- **Scope radiogroup + Source toggle:** `role="radiogroup"` with roving `tabindex` and arrow-key nav (reuse the panel's `SCOPE_ORDER` keydown handler verbatim); each radio carries `aria-checked`.
- **Targets:** all interactive ≥24px (≥44px under `pointer:coarse`) — the `✎`/`🗑` icon buttons, source-row actions, the `⋯` menu, segments.
- **Focus:** 2px `--kb-focus-ring`, 2px offset, ≥3:1. Sticky toolbar uses `scroll-margin` so a focused row below it isn't obscured (2.4.13 focus-not-obscured).
- **Live regions:** connect indexing progress + a remove/add/edit outcome announce via `role="status"` / `aria-live="polite"`; an index failure via `role="alert"`.
- **Untrusted text:** doc names/bodies/excerpts, source paths, residency, overlay answers — all interpolation only (escaped). No `[innerHTML]`. The repo's `no-tofu-glyphs` + `no-unsafe-binding` source scans stay green (every icon is a catalogued `dart-glyph`).

## 13. COLOUR / MOTION

- **Tokens only** (`--kb-*`). Source status: `--kb-success` (indexed/connected), `--kb-warning` (indexing), `--kb-danger` (failed). Overlay/external accent uses the same `--kb-accent` the Q&A egress line uses, with the `cloud` glyph. Scope-common keeps its `--kb-accent`-tinted chip (`chip--common`). Remove-danger is `--kb-danger` reinforced by the trash glyph + copy.
- **Motion:** the drawer slides in (`--kb-dur-base`, `--kb-ease-out`) and the source-row "arrive" reuses the board's `card-arrive`; **all gated by the existing `data-motion` + `--kb-dur-*` tokens** which a `prefers-reduced-motion: reduce` media query zeros to instant. No status is carried by motion — motion only narrates a transition (same rule as the board).

---

## 14. THE GLYPHS USED (all already in `dart-glyph` — no new icons)

`base`(panel tile via the shell's existing SVG) · `search` · `add-comment` · `edit` · `trash` · `info` · `cross` · `check` · `tag` · `scope-project` · `scope-common` · `folder-stack` · `cloud` · `propose` · `approve` · `reject` · `save` · `spinner` · `kebab` · `warning` · `stack`. **No new glyph is required** — every icon position resolves to an existing catalogued glyph, so the `no-tofu-glyphs` scan stays green.

---

## 15. ENTRY POINT FROM THE SHELL (for `/fe`)

1. **The panel footer button becomes live.** In `base-panel.component.ts`, the existing **"Manage knowledge"** footer button (today `disabled` / `aria-disabled` / "soon") becomes a live button emitting an `openPage` output — exactly as `dart-tasks-panel` emits `openBoard` and the workflow panel emits `openBuilder`. Drop the `soon` pill and the `disabled`/`aria-disabled`; keep the chevron `ph__arrow`. `aria-label="Manage knowledge"`.
2. **The shell adds a `knowledgeOpen()` view-mode.** In `project-shell.component.ts`, mirror `boardOpen` / `builderOpen`: a `knowledgeOpen_` signal, `openKnowledge()` (which closes the other two), `closeKnowledge()`, and a `@else if (knowledgeOpen())` branch rendering `<section class="board-view" data-testid="knowledge-page-view" aria-label="Knowledge">` with the shared `board-view__head` (back button `data-testid="knowledge-back"` + title "Knowledge") and `<dart-knowledge-page [state]="liveState()" [projectName]="title()" (applied)="adoptState($event)" />`. Wire the base panel's `(openPage)="openKnowledge()"`.
3. **Live-state contract:** the page binds `liveState()` and emits `applied` so every CRUD/connect mutation flows through `adoptState` and an SSE push re-derives the page in place — identical to the board's contract. No new route (consistent with the board + builder being in-shell view modes).

---

## 16. BUILDABILITY (single FE dev, Angular 21 + inline SVG)

- **Page shell + entry:** trivial — mirror the board's `board-view` mechanics already in the shell.
- **Doc list + search/filter:** reuse the panel's scope/stack/kind logic + chip grammar; add a client-side text filter and the per-row `✎`/`🗑` buttons. Mostly a re-layout of existing pieces into a denser worklist.
- **Editor drawer:** generalise `dart-add-note-form` to accept an optional `note` and call `kb/update` in edit mode — the validation, escaped preview, scope radiogroup, and honesty copy are reused, not rebuilt.
- **Remove confirm:** a small `alertdialog`.
- **Connect:** reuse `folder-picker.component.ts` + `FsService`; render the source rows from `state.knowledge.sources`; call the three `kb/source/*` endpoints.
- **Canon seam:** the Source toggle + the external source row + the egress disclosure are **data-driven** off the already-existing grounding/egress fields — the Q&A needs **zero change**. The overlay is "just another source".
- **No new runtime deps, no icon library, no `[innerHTML]`.** Existing `no-tofu-glyphs` / `no-unsafe-binding` tests stay green.
- **Suggested order:** (1) panel button live + shell `knowledgeOpen` view-mode; (2) doc list + scope/stack/kind/search; (3) editor drawer (add first, then edit + `kb/update`); (4) remove confirm + `kb/remove`; (5) ask panel placement (reuse as-is); (6) connect-sources region + `kb/source/*`; (7) Canon overlay seam (toolbar Source toggle + external source row — last, data-driven).

---

## 17. OPEN QUESTIONS for `/po`

1. **D/E split or stacked?** Wide-screen side-by-side doc-list + ask, or ask always below the list? (I propose side-by-side on `≥lg`, stacked otherwise.)
2. **Edit scope-move:** allow changing a note's scope on edit (a vault move), or force remove+re-add? (I propose allow, with the inline "Moving from X to Y" disclosure.)
3. **Connect-source v1 surface:** confirm the minimal connect/status/re-index/disconnect set (no globs/schedule) is enough for the dogfood, or is an ignore-glob field needed day one?
4. **Storage copy:** confirm the local-write line wording once `/be` picks files vs SQLite (§8) so the "saves a markdown file" copy stays literally true.
5. **Canon write-through:** confirmed out of scope for v1 (local writes only; publishing to Canon is governed and later)?

**Status:** Draft → awaiting `/po` review. On approval, record `DESIGN_APPROVED` (soft) in the ledger and hand to `/fe` (page + drawer + connect UI) and `/be` (§9 endpoints), with **`/secops` reviewing `/api/kb/source/*`** (hard gate — it registers filesystem paths for indexing and surfaces an external overlay's egress) and **`/arch`** sizing the local store (files vs SQLite) behind the unchanged `KnowledgeView` projection.
