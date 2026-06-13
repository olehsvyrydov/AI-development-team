# BUILD SPEC — Dedicated Knowledge Page (DART, MVP)

**Designer:** Aura (`/ui`) · **Date:** 2026-06-13 · **Status:** Draft → In Review (awaiting `/po`)
**Gate this artifact records on approval:** `DESIGN_APPROVED` (soft). This is the single consolidated, implementable spec `/fe` builds from; it supersedes the five investigation docs (`aura-page.md`, `anna-research.md`, `jorge-arch.md`, `max-product.md`, `apex-strategy.md`) for build purposes by folding their decisions into one buildable surface.
**Scope of this slice (MVP):** the Knowledge **page** + full **CRUD** (add/edit/remove) + **connect-an-external-codebase**. Storage stays markdown files (the SQLite FTS index is a separate `/be`/`/arch` ticket — the page is **storage-agnostic** and must not assume it). Canon is a **seam only** — no "connect Canon" control ships in this slice; the sources strip is shaped so an external overlay row *could* appear there later, disclosed.

**Stack:** Angular 21, standalone, `OnPush`. **Inline SVG only — no icon library.** Dark-first, `--kb-*` tokens only, WCAG 2.2 AA, `prefers-reduced-motion` respected. **No `[innerHTML]`** — every untrusted string (note name/body/excerpt, tags, source path, source label, residency, overlay answer) renders via interpolation only (escaped). Design only — no production code in this doc.

> **Wireframe glyph convention (READ FIRST):** the ASCII mocks use placeholder symbols (`＋ ‹ › ✎ 🗑 ⋯ ● ◐ ⚠ ⌕ ✕ 💾`) and quoted glyph *names* to mark where an inline-SVG `dart-glyph` goes. The repo's `no-tofu-glyphs` source-scan forbids those literal symbols in component source. **Do NOT paste a wireframe symbol into a template** — every icon position resolves to a named glyph from the existing `GLYPH_NAMES` catalogue (§9). The mocks are diagrams, not markup.

---

## 0. Grounding — what exists today (verified in source)

| Thing | Where | What `/fe` reuses |
|---|---|---|
| Knowledge **panel** | `shell/base-panel.component.ts` (`dart-base-panel`) | scope radiogroup (`SCOPE_ORDER`, roving arrows), stack/kind `filters__sel` selects, chip grammar (`chip--scope`/`chip--common`/`chip--stack`/`chip--kind`), `docStack()`, `methodLine()`, `docKey()`, the **"Manage knowledge" footer stub** (becomes the entry, §1) |
| In-shell **page** mechanics | `shell/project-shell.component.ts` — `boardOpen()`/`builderOpen()` swap the 3-panel grid for `<section class="board-view">` with a `board-view__head` (back button + title). **NOT routes.** | mirror verbatim for `knowledgeOpen()` (§1) |
| **Add** note | `shell/add-note-form.component.ts` (`dart-add-note-form`) → `ControlPlaneService.addKbNote()` → `POST /api/kb/add` | generalise into the **editor drawer** (§3); all validation/escaped-preview/scope-radiogroup/honesty copy reused |
| **Propose-inbox** | `shell/propose-inbox.component.ts` (`dart-propose-inbox`) → `approveProposal()`/`rejectProposal()` | drop in unchanged (region C) |
| **Q&A** | `shell/knowledge-qa.component.ts` (`dart-knowledge-qa`) → `askKnowledge()` (`GET /api/knowledge/ask`, read-only, egress honest) | drop in unchanged (region E) |
| **Folder picker** | `projects/folder-picker.component.ts` (`dart-folder-picker`, `[open]` input, `(chosen)`/`(cancelled)` outputs) over `/api/fs/*` | reuse verbatim for connect-codebase (§4) — **build no second picker** |
| Models | `core/models.ts` — `KnowledgeView`, `KnowledgeDoc`, `KnowledgeScope`, `KnowledgeGrounding`, `KnowledgeMatch`, `KnowledgeAnswer`, `ProjectState.rev` | bind the page off `KnowledgeView`; the egress/grounding honesty fields already exist |
| Control plane | `core/control-plane.service.ts` — `MutationResult` (`ok:true` \| `ok:'conflict'` \| `ok:false`), `setProject()`, `addKbNote()`, `mutate()` (decodes 409 → `conflict` with fresh state) | add `kb/update`, `kb/remove`, `kb/source/*` as new methods on this one service (§7) |
| Glyphs | `shell/glyph.component.ts` — `GLYPH_NAMES` | every icon resolves to a name here; **no new glyph required** (§9) |

**Edit and Remove do NOT exist yet on the wire** — `/be` adds `kb/update` + `kb/remove` to the §7 contract; `/secops` hard-gates `kb/source/*` (it registers filesystem paths + can surface an external overlay's egress). Per `jorge-arch.md`: edit/remove extend the **one** guarded writer (realpath-contain + O_EXCL/atomic + CAS-on-`rev`); remove is **soft-delete to a contained scan-excluded trash**, confirm-gated, audited; connect-source writes a read-only `sources.json` record, never mutates the external tree.

**Honesty is the IA, not decoration** (`apex-strategy.md` §2.2): every row answers *"can my agent find this, where did it come from, and does using it leave my machine?"* **before** the note text. Provenance + grounding-honesty + scope lead each row.

---

## 1. THE PAGE SHELL + ENTRY (for `/fe`)

A new `knowledgeOpen()` **view-mode** in `project-shell.component.ts` — a peer of `boardOpen()`/`builderOpen()`, **mutually exclusive** with them, **NOT a route**. Binds the live `state` and emits `applied(state)` exactly like the board, so every CRUD/connect mutation and every SSE push re-derives the page in place.

### 1.1 The panel footer button becomes live (`base-panel.component.ts`)
The existing **"Manage knowledge"** footer button (today `disabled` / `aria-disabled` / `soon` pill) becomes a **live** button that emits an `openPage` output — exactly as `dart-tasks-panel` emits `openBoard`.
- **Remove:** the `disabled` attr, the `aria-disabled="true"`, the `<span class="ph__soon">soon</span>`.
- **Keep:** the chevron `ph__arrow` SVG, the `ph__foot` class, `data-testid="base-manage"`.
- **Set:** `aria-label="Manage knowledge"`, `(click)="manage.emit()"`, and add `readonly manage = output<void>();`.

### 1.2 The shell adds the view-mode (`project-shell.component.ts`)
Mirror `boardOpen`/`builderOpen` precisely:
- A `knowledgeOpen_ = signal(false)`; `readonly knowledgeOpen = this.knowledgeOpen_.asReadonly();`
- `openKnowledge()` sets `boardOpen_(false)` + `builderOpen_(false)` + `knowledgeOpen_(true)` (opening one closes the others — extend `openBoard`/`openBuilder` to also clear `knowledgeOpen_`).
- `closeKnowledge()` sets `knowledgeOpen_(false)`.
- A new `@else if (knowledgeOpen())` branch in `<main class="shell-body">`, placed alongside the board/builder branches:

```html
<section class="board-view" data-testid="knowledge-page-view" aria-label="Knowledge">
  <div class="board-view__head">
    <button type="button" class="board-view__back" data-testid="knowledge-back" (click)="closeKnowledge()">
      <!-- reuse the board-view__back chevron SVG verbatim -->
      Back to panels
    </button>
    <h2 class="board-view__title">Knowledge</h2>
  </div>
  <dart-knowledge-page [state]="liveState()" [projectName]="title()" (applied)="adoptState($event)" />
</section>
```
- Wire the base panel's new output: `<dart-base-panel [base]="b.value" (applied)="adoptState($event)" (manage)="openKnowledge()" />`.
- Import `KnowledgePageComponent` into the shell's `imports` array.

### 1.3 Live-state contract
`dart-knowledge-page` takes `[state]: ProjectState` and `[projectName]: string`, emits `applied: ProjectState`. It derives its `KnowledgeView` from `state.knowledge` internally (the page owns its own region-guards — a malformed slice fails one region, never blanks the page; mirror the shell's `derive()` per region, §6). All mutations call the control plane with `expectedRev = state.rev` and emit the returned fresh state through `applied`.

### 1.4 Page body regions (top → bottom)
Inside `board-view`, the page body uses the shell-body width (`max-width: 76rem`), regions stacked `gap: var(--kb-space-4)`:

```
A. TOOLBAR (sticky-top within body): [base tile] Knowledge · N notes · [search] · [＋ Add note]
   ── filters row: Scope segments (Project/Common/All + counts) · Stack▾ · Kind▾
   ── honest method line: "Indexed via: …"   ── (Source toggle: ABSENT this slice — seam only, §5)
B. CONNECTED SOURCES STRIP (absent-not-zero; one quiet invite line when empty)
C. PROPOSE-INBOX (dart-propose-inbox, absent when none — unchanged)
D ⟷ E.  DOC LIST (≈62%)  |  ASK (≈38%, sticky)        side-by-side on ≥lg, stacked on <lg
```
**Order rationale:** orient+act (A) → the new connect affordance (B, high but secondary) → pending decisions (C) → the work (D) → a tool you reach for (E). On `<lg`, E stacks under D; B and C stay full-width above the split.
**D/E split:** `grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 1fr)`, collapsing to one column under `--kb-bp-lg` (same `minmax`/`auto-fit` family the shell already uses). Reuse `.board-view__head` / `.board-view__back` / `.board-view__title` styles verbatim.

---

## 2. THE DOC LIST — provenance-first note rows (region D)

`<ul data-testid="kb-doc-list" aria-label="Knowledge notes">` of `<li>` rows. The whole row is **NOT a link** — its primary content is reading the body; the two actions are explicit buttons (unlike a Tasks card, a note is just text + tags).

**Row anatomy — provenance/honesty leads, then the title, then the snippet:**

```
ROW HEADER (lead with the machine's relationship to the note):
  [provenance badge] [scope badge] [stack chips] [kind chip] [index/grounding label]   …   ✎  🗑
  THEN:  note-name (weight 600, overflow-wrap:anywhere)
ROW BODY (2-line clamp of the markdown body, escaped):
  Use constructor injection; never field @Autowired. Keep services thin…
ROW FOOTER (muted): edited 2d ago
```

- **Provenance badge** (`data-testid="doc-provenance"`) — the trust spine. Three honest values, glyph + text (never colour alone):
  - **You** — glyph `edit`, text "You". (operator-authored)
  - **From /kai** — glyph `propose`, text "From /kai". (approved out of the propose-inbox)
  - **From codebase** — glyph `folder-stack`, text "Imported". (a connected-codebase item)
  - Source of the value: `doc.provenance` on the projection (§7.1). **Absent → omit the badge** (never fabricate an author, per `apex-strategy.md` §2.2). The provenance value is a closed enum from `/be`; render the matching catalogued glyph by lookup, never echo a free string into a glyph.
- **Scope badge** (`data-testid="doc-scope-badge"`) — reuse the panel's exactly: `scope-common` glyph + "Common" (`chip--common` accent) or `scope-project` glyph + "Project".
- **Stack chips / kind chip** — reuse `docStack(doc)` + the panel's `chip--stack` / `chip--kind` grammar verbatim (`any` dropped when specifics exist).
- **Index/grounding label** (`data-testid="doc-grounding"`) — `doc.index ?? 'indexed'` rendered in the row, **never overstated**: a filename-indexed note never says "semantic". This is the per-entry honesty badge (`apex-strategy.md` rank 1).
- **Name** — `doc.name`, weight 600, `overflow-wrap: anywhere` (untrusted slug).
- **Body preview** — 2-line clamp (`-webkit-line-clamp: 2`) of `doc.excerpt` (§7.1), escaped, `overflow-wrap: anywhere`. **If `excerpt` is absent → omit the preview line** (graceful: name + badges still scan).
- **`✎` edit** — `<button>` ≥24px, glyph `edit`, `aria-label="Edit {name}"`, `data-testid="doc-edit"`. Opens the editor drawer (§3) pre-filled with this note.
- **`🗑` remove** — `<button>` ≥24px, glyph `trash`, `aria-label="Remove {name}"`, `data-testid="doc-remove"`, hover/focus tints `--kb-danger` (danger reinforced by glyph + the confirm copy, never colour alone). Opens the remove confirm (§3.4).
- Track by `docKey(doc)` (`${scope}:${file ?? name}`) — reuse verbatim.

### 2.1 Search + filters (region A toolbar — all client-side, no round-trip)
The merged view is already loaded, so filtering is client-side (same philosophy as the panel's stack/kind filters).
- **Search** — `<input type="search" data-testid="kb-search" aria-label="Search notes">`, debounced, filters over `doc.name` + `doc.excerpt` (when present). Clearing restores the scope list. Result count announced `aria-live="polite"` ("18 notes" → "3 notes match").
- **Scope segments** — reuse the panel's `role="radiogroup"` (`knowledge-scope-project|common|all`, counts, `SCOPE_ORDER` roving arrows) verbatim.
- **Stack / Kind selects** — reuse `knowledge-filter-stack` / `knowledge-filter-kind` verbatim.
- **Combined-empty (search/filter matched nothing):** "No notes match these filters." + a **Clear filters** button (`data-testid="kb-clear-filters"`) — never leave the user staring at zero. Distinct from the genuine-empty state (§6).

---

## 3. CRUD — one focus-trapped editor drawer + a remove confirm

### 3.1 The editor drawer — `dart-note-editor` (add + edit share it)
A right-side **drawer** (slide-in sheet) keeping the doc list visible behind it. It is `dart-add-note-form` **generalised** to accept an optional `note` input and switch to edit. `role="dialog"`, `aria-modal="true"`, **focus-trapped**, **`Esc` closes**, focus **returns** to the `✎`/`＋` button that opened it (remember the trigger testid, as the board does). `data-testid="note-editor"`.

**Reuse wholesale from `add-note-form`:** title (≤200), body (≤64 KB UTF-8 measured), escaped `<pre>` preview, the scope radiogroup with the Common hint, the honest index preview, the fixed-enum scope, the friendly error mapping, the size meters. It already enforces the security contract (no path, escaped preview).

**Add mode** (`note` absent): today's form, header "Add knowledge" (glyph `add-comment`), primary "Add to knowledge" → `addKbNote()` (additive, no `expectedRev`). Unchanged behaviour.

**Edit mode** (`note: KnowledgeDoc` present):
- Header "Edit: {name}" (glyph `edit`); fields pre-fill from the note (title, body, scope, stack, kind); primary button **"Save note"** (glyph `save`).
- Submit calls **`kb/update`** with the note's `id`/`file` + `expectedRev = state.rev` (guarded CAS, §7.2) instead of `kb/add`.
- **Title:** per `jorge-arch.md`, title is the slug/identity — surface honestly. **MVP decision:** the title field is **read-only in edit mode** with a one-line note "Renaming makes a new note — remove this one and add it again." (a rename = add+delete, never a silent identity change). `/fe` renders the title disabled in edit mode; body/scope/stack/kind stay editable.

### 3.2 The honest local-write line (storage-agnostic)
The drawer's "saves a markdown file on this machine" line is the **one** place storage leaks into the UI. Render it from a single copy constant so a future store swap is a one-line change. **Ship this wording now** (matches today's file store): *"Saves to this project's knowledge on this machine — nothing is uploaded."* (storage-neutral, still honest; flagged for `/be` to confirm it stays literally true if SQLite lands). Keep the existing `data-testid="note-index-preview"` honesty line below it.

### 3.3 Scope-change disclosure (the over-share guard) — EDIT only
When the scope radio in **edit** mode changes **away from the note's loaded scope**, show an inline disclosure block immediately under the radiogroup (`data-testid="note-scope-change"`, `role="status"`, `aria-live="polite"`) — a scope move is a change to the **visibility boundary** and must never be silent:
- **Project → Common:** *"Moving from This project to Common — your other projects on this machine will be able to see this note (it stays on your machine; never a cloud)."*
- **Common → Project:** *"Moving from Common to This project — your other projects on this machine will no longer see this note."*
The disclosure is purely informational (no extra confirm button in this slice); the existing Common hint also stays. The server performs the move (a vault move) on `kb/update`; the UI states the consequence so a re-scope is never silent.

### 3.4 Remove confirm — `role="alertdialog"`
A small **centred** confirm (not a drawer — it's yes/no). `aria-modal="true"`, focus-trapped, **`Esc` = Cancel**, **initial focus on Cancel** (the destructive default is never auto-focused). `data-testid="note-remove-confirm"`.
- **Name + scope echoed** (escaped) so the operator confirms the *right* note.
- **Honest consequence copy** (from `apex-strategy.md` §4.1): *"“{name}” ({scope}) will be removed from this project on your machine. Your agents stop following it. This isn't sent anywhere, and it can't be undone here."*
- **Destructive button** "Remove note" (`data-testid="note-remove-confirm-ok"`, glyph `trash`, `--kb-danger` fill — colour + glyph + text). **Cancel** (`data-testid="note-remove-confirm-cancel"`) holds initial focus.
- Calls **`kb/remove { id|file, expectedRev }`** (guarded CAS, soft-delete, §7.3) → adopts fresh `state`; the row leaves the list and the count decrements from that single source of truth.
- **No bulk delete** in this slice — one note at a time (skeptical default: don't hand a one-click way to wipe the team's rules).

### 3.5 Conflict (409) handling — both edit and remove
Both ride `MutationResult`. On `ok:'conflict'` (the existing 409 decode carrying fresh `state`):
- **Edit:** inline "This note changed elsewhere — reloaded." in the drawer; **re-fill** the fields from the fresh note; emit the fresh state via `applied`. No clobber.
- **Remove:** "This note changed elsewhere — refresh." in the confirm; emit fresh state; do **not** blind-delete.
On `ok:false`: the existing friendly-error mapping (extended for update/remove reasons).

---

## 4. CONNECT-AN-EXTERNAL-CODEBASE (region B)

**Connecting a codebase = registering a folder as a read-only indexed knowledge source.** The page does NOT crawl files into the note list — it registers the source and shows its index status; searching/asking then includes that source (the backend owns the index, in `claude/memory`, never the hub). Minimal-by-design (`jorge-arch.md` §3, `anna-research.md` §3): **connect / status / re-index / disconnect — and nothing more.** No file tree, no per-file toggles, no include/exclude globs, no crawl schedule in v1.

### 4.1 Connect action + dialog (reuse the folder picker)
The **`＋ Connect…`** button (`data-testid="kb-source-connect"`) in region B opens the **existing** `dart-folder-picker` (`[open]` input, `(chosen)`/`(cancelled)` outputs over `/api/fs/*`). On `(chosen)` it calls **`kb/source/connect { path, expectedRev }`** (§7.4). **Build no new picker.** Picker copy stays the ratified honesty (`apex-strategy.md` §4.1): *"Point DART at another local repo — it reads the code and docs, read-only, on this machine. Nothing is uploaded; DART never writes outside that folder."*

### 4.2 The source row (and only this)
Each connected source renders one row (`data-testid="kb-source-row"`):
- **Label** — folder basename, glyph `folder-stack`. Path echoed below, muted, `overflow-wrap: anywhere` (untrusted, escaped).
- **Status** (`data-testid="kb-source-status"`) — glyph + colour + text: `● indexed` (`--kb-success`), `◐ indexing…` (`--kb-warning`), `⚠ index failed — {reason}` (`--kb-danger`, glyph `warning`). Status is from `source.status`; the reason is escaped.
- **Honest index label** (`data-testid="kb-source-method"`) — "{n} files · filename" / "{n} files · semantic" — the **same honesty as the note method line**: never says "semantic" unless an embedder is genuinely wired (`source.method`).
- **Last-indexed timestamp + freshness** (`data-testid="kb-source-freshness"`) — REQUIRED, not optional (`anna-research.md` §1b.4, gap #3): show "indexed {relative time}"; when the projection reports the source **stale** (files changed after the last index), show a **"stale — re-index"** marker (glyph `warning` + text). Staleness shown, never hidden.
- **Re-index** (`data-testid="kb-source-reindex"`) — `kb/source/reindex`; disabled while `status === 'indexing'`.
- **`⋯` menu** (glyph `kebab`, `data-testid="kb-source-menu"`) → **Disconnect** → a confirm: *"Disconnect {label}? Its files stop being searchable here. The folder itself is untouched."* → `kb/source/disconnect`. Disconnect removes the **registration**, never the user's files — the copy says so.

```
ON CONNECT → row appears "indexing":
[folder-stack] payments-api/src     ◐ indexing… · 142 files found
  /home/oleh/git/workspace/payments-api/src                       [ Cancel ]
→ settles to:
[folder-stack] payments-api/src     ● indexed · 142 files · filename · indexed just now
  /home/oleh/git/workspace/payments-api/src         [ Re-index ]  [ ⋯ ]
```

### 4.3 Empty state of region B (the one allowed empty-affordance)
When no source is connected, region B renders **one quiet invitation line** (not a hero, not absent — the connect feature is otherwise undiscoverable):
```
[folder-stack] Connect a codebase to make it searchable here.            [ Connect ]
```
`data-testid="kb-source-empty"`. This is the single deliberate empty-affordance; everywhere else absent-not-zero holds.

---

## 5. THE CANON SEAM — shape only, NO control this slice

Per the user-approved MVP and `apex-strategy.md` §4.2 (dead-control anti-pattern): **no "connect Canon" button ships now.** Design the seam so an external overlay row *could* appear in region B later, disclosed, **without a rebuild**:
- The source row (§4.2) is rendered from a generic `source` model that carries `external: boolean` and an optional `residency`. A codebase source is `external:false` (glyph `folder-stack`). A future overlay source would be `external:true` → glyph `cloud` + a verbatim residency sentence + the egress disclosure — **driven by data, not a second code path**. `/fe` writes the row to read these fields now (defaulting `external:false`), so the overlay case is additive later.
- The toolbar **Source toggle** (Local files / Canon) is **NOT rendered** this slice — it appears only when the projection reports an overlay **configured + enabled + healthy** (§7.5). Until then it is **absent**, never a disabled tease. `/fe` may leave a guarded `@if (overlayPresent())` block that is structurally present but never true in this slice.
- The **Q&A egress disclosure needs zero change** — `dart-knowledge-qa` already renders the egress line solely from `egressDisclosed` and names residency verbatim (`KnowledgeAnswer`/`KnowledgeGrounding`). The seam is the data; it is already wired. Do not invent a second egress/disclosure path.

**`/fe` builds for this slice:** codebase sources only. The overlay row and Source toggle are **data-driven affordances that stay absent** until `/be` lights up §7.5 — that is the whole seam.

---

## 6. STATES — loading / empty / quiet / error (honest, never bare)

| Surface | Loading | Empty (honest) | Error |
|---|---|---|---|
| Page body | region skeletons (toolbar bar + 4 row skeletons in D) | — | per-region banner; one region failing never blanks the others (each region behind its own `derive()` guard, mirroring the shell) |
| Doc list (D) | 4–6 shimmer rows (static stripe under reduced-motion) | **whole-empty:** "No knowledge yet — add the rules and context your team must follow." + **＋ Add note** (`data-testid="kb-empty"`) — never bare "No data" | "Couldn't load notes." (region-local) |
| Doc list — filtered | — | "No notes match these filters." + **Clear filters** | — |
| Doc list — common scope empty | — | reuse panel copy: "No common knowledge yet — add a shared note, or promote a project note." | — |
| Connected sources (B) | row skeleton while a connect is in flight | one quiet **Connect a codebase…** invite line (§4.3) | per-row "⚠ index failed — {reason}" + Re-index |
| Propose-inbox (C) | — | **absent** (not a zero state) — unchanged | per-card error (existing) |
| Ask (E) | "Asking the knowledge base…" (existing) | idle, no answer yet — unchanged | "Couldn't reach the knowledge base — try again." (existing) |
| Editor drawer | "Adding note…" / "Saving…" | — | inline friendly error + 409 reconcile (§3.5) |
| Remove confirm | button → spinner glyph + "Removing…" | — | "This note changed elsewhere — refresh." |

**First-run (no notes, no sources, no proposals — the OSS common case):** scope segments + stack/kind selects are **hidden** while empty (nothing to filter — mirror the panel's `isEmpty()`); the Ask panel is **hidden** until ≥1 note exists (mirror the panel's "Q&A only when not empty"); region B shows the one invite line. Design the empty/quiet/single-entry states first — they are the common case for a fresh project (`apex-strategy.md` →/ui).

---

## 7. DATA MAPPING + CONTROL-PLANE CONTRACT (for `/be`, gated by `/arch` + `/secops`)

The page binds `state.knowledge: KnowledgeView`. Beyond what exists today (`method`, `stack`, `counts`, `docs`, `proposals`), `/be` adds:

### 7.1 Doc projection — provenance + excerpt + honest method
Extend `KnowledgeDoc` with optional:
- **`provenance?: 'you' | 'kai' | 'codebase'`** — drives the provenance badge (§2). Absent → badge omitted.
- **`excerpt?: string`** — server-capped (~280 chars, escaped on render) — drives the 2-line preview. Absent → preview omitted.
- Keep `index?: string` as the per-row honest grounding label.
Allow `KnowledgeView.method` to also be **`local-fts`** (SQLite full-text) and **`overlay`** so the method line/source label stay honest across stores (§3.2, §5). The page reads `method` only to phrase the honest line — it makes no capability decision on it.

### 7.2 Edit — `POST /api/kb/update`
`{ id | file, title, body, scope, stack, kind, expectedRev }` → guarded CAS write (realpath-contain + atomic + CAS-on-`rev`); re-validates (same caps as add); handles a scope change as a **vault move**; returns fresh `state` (carries new `rev`). **409** on stale `rev`. **Never accepts a path** — addresses the note by server-known `id`/`file`. Client method: `editKbNote(input): Promise<MutationResult>` (returns `ok:'conflict'` on 409 via the existing `mutate()` 409 decode).

### 7.3 Remove — `POST /api/kb/remove`
`{ id | file, expectedRev }` → guarded CAS **soft-delete** (move to a contained, scan-excluded `.trash`, NOT `unlink`), confirm-gated server-side, audited (tombstone retained, like a rejected proposal). Returns fresh `state`. **409** on stale `rev`. Client method: `removeKbNote(input): Promise<MutationResult>`.

### 7.4 Connect-source — `POST /api/kb/source/{connect,reindex,disconnect}`
```
connect    { path, expectedRev }              → realpath-pinned read-only source record + starts indexing
reindex    { sourceId, expectedRev }
disconnect { sourceId, expectedRev }
state.knowledge.sources?: readonly KbSource[]
```
`KbSource = { id, label, path, kind: 'codebase' | 'overlay', status: 'connected'|'indexing'|'indexed'|'failed', fileCount?, method: string, lastIndexedAt?, stale?: boolean, residency?: string, external: boolean }`
- **Reuses `/api/fs/*`** for folder choice — no new browser.
- **`external` drives the cloud-vs-folder distinction + (future) egress disclosure** — keeps disclosure data-driven (cannot drift). A codebase source is `external:false`; an overlay source `external:true`.
- **Security (`/secops` HARD gate):** `path` realpathed + confined to allowed roots exactly as `/api/fs/list`; write-guard header required; connector is **read-only** (never writes under the source root); per-file realpath-containment skips symlink escapes; default-exclude `.git`/`node_modules`/dotfiles; size/count caps; binary/non-UTF-8 skipped. `path` / `label` / `residency` are **UNTRUSTED on render** (escaped). No egress for a codebase source. Client methods: `connectKbSource`/`reindexKbSource`/`disconnectKbSource` → `MutationResult`.

### 7.5 Overlay-presence flag (the seam gate)
`state.knowledge` (or a config read) exposes whether an external overlay is **configured + enabled + healthy** (e.g. `overlayPresent?: boolean`). The Source toggle (§5) and any overlay source row appear **only** when true (absent otherwise — never a disabled tease), mirroring the Q&A's existing "egress only when configured + healthy" rule. **In this slice it is expected false.**

All client additions live on the **one** `ControlPlaneService`, each carrying the scoped `project` id (via `setProject`) and `expectedRev` from `state.rev`, decoding 409 → `conflict` at the one `mutate()` chokepoint. No second write path.

---

## 8. ACCESSIBILITY (WCAG 2.2 AA) + COLOUR/MOTION

- **Colour never alone:** every provenance value, scope/kind/stack chip, source status (indexed/indexing/failed/stale/connected), the external-vs-local distinction (`cloud` vs `folder-stack`), and the destructive remove all pair **glyph + text**. External/egress (future) is `cloud` + an explicit residency sentence, never hue alone.
- **Drawer + confirms:** editor `role="dialog"` / remove `role="alertdialog"`, `aria-modal`, **focus trapped**, `Esc` closes, focus **returns** to the opening `✎`/`🗑`/`＋`. Remove dialog's **initial focus is Cancel**.
- **Doc list semantics:** `<ul aria-label="Knowledge notes">` of `<li>`; `✎`/`🗑` are real `<button>`s with `aria-label="Edit {name}"` / `"Remove {name}"`.
- **Search:** `<input type="search">` + `aria-label`; result count via `aria-live="polite"`.
- **Scope radiogroup:** `role="radiogroup"`, roving `tabindex`, arrow-key nav (reuse the panel's `SCOPE_ORDER` keydown handler verbatim); `aria-checked` per radio.
- **Targets:** all interactive ≥24px (≥44px under `pointer:coarse`) — `✎`/`🗑`, source-row actions, `⋯`, segments.
- **Focus:** 2px `--kb-focus-ring`, 2px offset, ≥3:1. Sticky toolbar uses `scroll-margin` so a focused row below it isn't obscured (2.4.13).
- **Live regions:** connect indexing progress + add/edit/remove outcome via `role="status"` / `aria-live="polite"`; an index failure via `role="alert"`. The scope-change disclosure (§3.3) is `aria-live="polite"`.
- **Untrusted text:** note names/bodies/excerpts, source paths, labels, residency, overlay answers — interpolation only (escaped). **No `[innerHTML]`.** The repo's `no-tofu-glyphs` + `no-unsafe-binding` source scans stay green (every icon is a catalogued `dart-glyph`).
- **Colour tokens** (`--kb-*` only): source status `--kb-success` (indexed/connected), `--kb-warning` (indexing/stale), `--kb-danger` (failed). Remove-danger `--kb-danger` + trash glyph + copy. Scope-common keeps `chip--common` (`--kb-accent`).
- **Motion:** the drawer slides in (`--kb-dur-base`, `--kb-ease-out`); a source-row "arrive" reuses the board's `card-arrive`. **All gated by `data-motion` + `--kb-dur-*` tokens** which a `prefers-reduced-motion: reduce` query zeros to instant. No status is carried by motion — motion only narrates a transition.

### 8.1 Test IDs
- **Reuse (keep working where reused):** `knowledge-title`, `knowledge-local`, `base-count` (→ page header count), `knowledge-scope-{project|common|all}`, `knowledge-filter-{stack|kind}`, `base-method`, `knowledge-doc`, `doc-scope-badge`, `base-add`, `base-manage` (now live), and all `note-*` testids inside the generalised editor, plus the propose-inbox + Q&A testids.
- **New (page + CRUD + sources):** `knowledge-page-view`, `knowledge-back`, `kb-search`, `kb-clear-filters`, `kb-doc-list`, `doc-provenance`, `doc-grounding`, `doc-edit`, `doc-remove`, `note-editor`, `note-scope-change`, `note-remove-confirm`, `note-remove-confirm-ok`, `note-remove-confirm-cancel`, `kb-empty`, `kb-source-connect`, `kb-source-empty`, `kb-source-row`, `kb-source-status`, `kb-source-method`, `kb-source-freshness`, `kb-source-reindex`, `kb-source-menu`.

---

## 9. THE GLYPHS USED (all already in `GLYPH_NAMES` — no new icons)

`add-comment` · `edit` · `trash` · `info` · `cross` · `check` · `tag` · `scope-project` · `scope-common` · `folder-stack` · `cloud` (seam only) · `propose` · `approve` · `reject` · `save` · `spinner` · `kebab` · `warning` · `stack` · `search`. The page header's "base" tile reuses the panel's bespoke inline-SVG tile (not a catalogued glyph) — copy that header SVG. **No new glyph required** → `no-tofu-glyphs` stays green.

---

## 10. ASCII MOCKS

### 10.1 Page — POPULATED (wide ≥lg)
```
┌─ shell board-view__head ───────────────────────────────────────────────────────────────────┐
│ ‹ Back to panels        Knowledge                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ A. toolbar (sticky) ──────────────────────────────────────────────────────────────────────┐
 │ [base] Knowledge  24 notes                       [ ⌕ search notes…        ]   [ ＋ Add note ] │
 │ ──────────────────────────────────────────────────────────────────────────────────────────  │
 │ Scope: ( This project 18 )( Common 6 )( All 24 )      Stack:[any▾]   Kind:[all▾]            │
 │ Indexed via: filename index only — connect an embedder for semantic recall                  │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ B. connected sources ─────────────────────────────────────────────────────────────────────┐
 │ Connected codebases                                                          [ ＋ Connect… ] │
 │ ┌────────────────────────────────────────────────────────────────────────────────────────┐ │
 │ │ [folder-stack] payments-api/src   ● indexed · 142 files · filename · indexed 2h ago      │ │
 │ │   /home/oleh/git/workspace/payments-api/src                   [ Re-index ]  [ ⋯ ]        │ │
 │ └────────────────────────────────────────────────────────────────────────────────────────┘ │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ C. proposed (from /kai) ──────────────────────────────────────────────────────────────────┐
 │ [propose] Proposed knowledge   from /kai                                       3 pending     │
 │  …existing dart-propose-inbox, unchanged…                                                   │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ D. DOC LIST (≈62%) ──────────────────────────────────────┐ ┌─ E. ASK (≈38%, sticky) ───────┐
 │ Notes (18 in this scope)                                   │ │ [search] Ask the knowledge base│
 │ ┌────────────────────────────────────────────────────────┐│ │ Check what DART holds on a topic│
 │ │ [edit]You [Project][tag java][rule] · filename   ✎  🗑  ││ │ [ how do we retry webhooks?  ] ⌕│
 │ │ code-rules                                              ││ │ ─────────────────────────────  │
 │ │ Use constructor injection; never field @Autowired…     ││ │ (answer renders here, with the │
 │ │ edited 2d ago                                          ││ │  honest grounding label + the  │
 │ ├────────────────────────────────────────────────────────┤│ │  egress line ONLY when an      │
 │ │ [propose]From /kai [Common][tag any][style] · filename ✎🗑│ │  overlay actually answered)    │
 │ │ test-policy                                             ││ │                                │
 │ │ Every behaviour gets a failing test first (TDD)…       ││ │                                │
 │ │ edited 5d ago                                          ││ └────────────────────────────────┘
 │ └────────────────────────────────────────────────────────┘│
 └────────────────────────────────────────────────────────────┘
```

### 10.2 Page — EMPTY (OSS first-run: no notes, no sources, no proposals)
```
┌─ ‹ Back to panels        Knowledge ─────────────────────────────────────────────────────────┐
 ┌─ toolbar ──────────────────────────────────────────────────────────────────────────────────┐
 │ [base] Knowledge                                                              [ ＋ Add note ] │
 │ ──────────────────────────────────────────────────────────────────────────────────────────  │
 │ Indexed via: filename index only — connect an embedder for semantic recall                  │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘  (scope/filters hidden while empty)
 ┌─ connected sources ────────────────────────────────────────────────────────────────────────┐
 │ [folder-stack] Connect a codebase to make it searchable here.                  [ Connect ]  │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ DOC LIST ─────────────────────────────────────────────────────────────────────────────────┐
 │            No knowledge yet — add the rules and context your team must follow.               │
 │                                  [ ＋ Add note ]                                              │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘   (Ask panel hidden until ≥1 note)
```

### 10.3 EDITOR DRAWER — ADD mode (slides from right)
```
                                          ┌─ drawer (role=dialog, focus-trapped) ────────────┐
                                          │ [add-comment] Add knowledge                  ✕   │
                                          │ ─────────────────────────────────────────────── │
                                          │ [info] Saves to this project's knowledge on this │
                                          │        machine — nothing is uploaded.            │
                                          │ Title *                                          │
                                          │ [                                     ]  0 / 200 │
                                          │ Body (markdown) *                                │
                                          │ ┌──────────────────────────────────────────────┐ │
                                          │ │                                              │ │
                                          │ └──────────────────────────────────────────────┘ │
                                          │ 0 B / 64 KB                          ▸ Preview    │
                                          │ Scope: ( ●This project )( Common )               │
                                          │ Stack: [ any ▾ ]    Kind: [ context ▾ ]          │
                                          │ [info] Saved as a filename-indexed note.         │
                                          │ ─────────────────────────────────────────────── │
                                          │                  [ Cancel ]  [ 💾 Add to knowledge ]│
                                          └──────────────────────────────────────────────────┘
```

### 10.4 EDITOR DRAWER — EDIT mode WITH scope-change disclosure
```
                                          ┌─ drawer (role=dialog) ───────────────────────────┐
                                          │ [edit] Edit: code-rules                      ✕   │
                                          │ ─────────────────────────────────────────────── │
                                          │ [info] Saves to this project's knowledge on this │
                                          │        machine — nothing is uploaded.            │
                                          │ Title  [ code-rules ] (read-only)                │
                                          │   Renaming makes a new note — remove this one     │
                                          │   and add it again.                              │
                                          │ Body (markdown) *                                │
                                          │ ┌──────────────────────────────────────────────┐ │
                                          │ │ Use constructor injection; never field       │ │
                                          │ │ @Autowired. Keep services thin and testable. │ │
                                          │ └──────────────────────────────────────────────┘ │
                                          │ 312 B / 64 KB                        ▸ Preview    │
                                          │ Scope: ( This project )( ●Common )               │
                                          │ ┌────────────────────────────────────────────┐   │ ← scope-change disclosure
                                          │ │ [info] Moving from This project to Common —  │  │   (role=status, appears only
                                          │ │ your other projects on this machine will be  │  │    when scope changes from the
                                          │ │ able to see this note (stays on your machine).│ │    loaded value)
                                          │ └────────────────────────────────────────────┘   │
                                          │ Stack: [ java ▾ ]    Kind: [ rule ▾ ]           │
                                          │ [info] Saved as a filename-indexed note.         │
                                          │ ─────────────────────────────────────────────── │
                                          │                       [ Cancel ]  [ 💾 Save note ]│
                                          └──────────────────────────────────────────────────┘
```

### 10.5 REMOVE CONFIRM (role=alertdialog, initial focus = Cancel)
```
┌─ Remove this note? ───────────────────────────────────────────────────────────┐
│ [trash] Remove this note?                                                      │
│                                                                                │
│ “code-rules” (Project) will be removed from this project on your machine.      │
│ Your agents stop following it. This isn't sent anywhere, and it can't be       │
│ undone here.                                                                   │
│                                                                                │
│                                          [ Cancel ]   [ 🗑 Remove note ]        │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 10.6 CONNECT — folder-picker (reused) → source row appears
```
┌─ Choose a folder to index ───────────────────────────────────────────────  ✕ ┐
│ ⌂ Home  ›  oleh  ›  git  ›  workspace                                          │
│ [ ⟵ Up ]                                              ⌕ filter folders…        │
│   ▸ 📁 payments-api      ▸ 📁 marketing-site                                   │
│ Selected: /home/oleh/git/workspace/payments-api/src                           │
│                                                       [ Cancel ] [ Connect ]   │
└────────────────────────────────────────────────────────────────────────────────┘
   → on Connect, dialog closes; region B shows the new row ◐ indexing… → ● indexed.

CONNECTED SOURCE ROW (settled):
┌────────────────────────────────────────────────────────────────────────────────┐
│ [folder-stack] payments-api/src    ● indexed · 142 files · filename · indexed 2h ago │
│   /home/oleh/git/workspace/payments-api/src              [ Re-index ]  [ ⋯ ]   │
└────────────────────────────────────────────────────────────────────────────────┘   ⋯ → Disconnect
```

---

## 11. BUILDABILITY + SUGGESTED ORDER (single FE dev, Angular 21 + inline SVG)

1. **Panel button live + shell `knowledgeOpen()` view-mode** — trivial; mirror `boardOpen` (§1).
2. **Doc list + scope/stack/kind/search** — re-layout of existing panel pieces into a denser, provenance-first worklist + a client-side text filter + per-row `✎`/`🗑` (§2).
3. **Editor drawer (add first, then edit + `kb/update`)** — generalise `dart-add-note-form` with an optional `note`; add edit submit + the scope-change disclosure + read-only title (§3).
4. **Remove confirm + `kb/remove`** — a small `alertdialog` (§3.4).
5. **Ask panel placement** — reuse `dart-knowledge-qa` as-is (§1.4 region E).
6. **Connect-sources region + `kb/source/*`** — reuse `dart-folder-picker`; render rows from `state.knowledge.sources` (§4).
7. **Canon seam** — write the source row + Source toggle to read `external`/`residency`/`overlayPresent`, all defaulting absent/false this slice (§5).

No new runtime deps, no icon library, no `[innerHTML]`. Existing `no-tofu-glyphs` / `no-unsafe-binding` tests stay green.

---

## 12. THE SINGLE RISKIEST IMPLEMENTATION DETAIL (`/fe` watch this)

**The `expectedRev` CAS round-trip for edit and remove — never optimistic-clobber, always reconcile from the one fresh `state`.** Every mutating surface so far is additive (add, approve, reject — no `rev`). Edit and remove are the **first knowledge writes that can conflict**: two sessions (or an agent mid-run) editing/deleting the same note. `/fe` MUST send `expectedRev = state.rev` from the currently-bound live state on **every** `kb/update`/`kb/remove`, and MUST treat the `ok:'conflict'` branch as a **first-class outcome**, not an error toast — re-fill the drawer (edit) or hold the confirm (remove) from the fresh `state` the 409 returns, then emit it via `applied` so the whole page re-derives. Getting this wrong silently destroys a concurrent edit to a rule the agents obey — the exact failure DART exists to prevent (`jorge-arch.md` R2). The contract already exists at `mutate()` (it decodes 409 → `conflict` with fresh state); the risk is the **drawer/confirm forgetting to thread `state.rev` in and the fresh `state` back out**. Build the conflict path with a test before the happy path.

---

**Status:** Draft → awaiting `/po` review. On approval: record `DESIGN_APPROVED` (soft) in the ledger; hand to `/fe` (page + drawer + connect UI, §1–§6, §8–§11) and `/be` (§7 endpoints), with **`/secops` hard-gating `/api/kb/source/*`** (registers filesystem paths; future overlay egress surface) and **`/arch`** confirming the storage-agnostic projection (files now, optional SQLite index later) behind the unchanged `KnowledgeView`.
