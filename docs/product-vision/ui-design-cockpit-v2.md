# UI/UX Redesign — DART Cockpit v2 (Project Card, Folder Picker, Project Shell)

**Designer:** Aura (`/ui`)
**Date:** 2026-06-07
**Status:** Draft → In Review (awaiting `/po`)
**Scope:** Focused redesign responding to concrete user feedback on the running Cockpit. Design spec only — no production code. Extends `docs/product-vision/ui-design.md` (the full studio vision); this doc supersedes the relevant card / connect / shell sections for the **next buildable slice**.
**Stack constraint:** Angular 21.2, standalone components, OnPush. **Inline SVG only — no icon library** (matches KGB / the existing cockpit). Dark-first, `--kb-*` tokens, WCAG 2.2 AA.

---

## 0. Grounding — what exists today (inspected live via Playwright)

I drove headless Chromium against the running cockpit (`localhost:4200`, hub `:4477`) and read the source. Current state:

- **Projects Home** — a dark grid of `ProjectCard`s + an always-last **Connect** cell. The card shows icon + title, stack chips (often empty), a 3-line clamped description, status dot + "updated 2h ago". **Good baseline; keep it.**
- **Connect cell** — a **free-text "Folder path" `<input>`** with `/path/to/your/project` placeholder + Connect button. This is the exact thing the feedback wants replaced with a *folder-choosing experience*.
- **Project Shell** — a gradient header (back link, glyph, title, one-line truncated description) and **three empty placeholder panels** ("Workflow / Tasks / Base — coming soon"), no icons, no substance. This is the surface to redesign.
- **Real bug surfaced while grounding:** for this repo the auto-collected description is raw README markdown (`![Claude Code](https://img.shields.io/...)`) — badge syntax leaks as text on the card and in the header. The redesign assumes the Core sanitises/strips this into clean prose (see §6 backend asks → `description` cleanup); the UI still renders it as escaped text (untrusted-source rule preserved).

**Existing backend already exposes (no new endpoints needed for these):** per-project `profile` (`title`, `description`, `stack[]`, `keyFiles[]`, `source`) and `state` (`tickets[]` each with `status` ∈ `done|blocked|in_progress|waiting` + `stage`/`assignee`/`gates`, plus `tracks{}`, `gateDefs[]`, `stageOwners{}`, `kb[]`). The redesign leans on this; §6 lists the **small additions** Core must expose (status counts, doc-index facts, directory listing, a read-only workflow graph projection).

**Honouring the canon:** status = **colour + glyph + text** (never colour alone); surfaces by elevation/brightness not heavy shadow; accent reserved for "live/active/primary"; monoline inline-SVG glyphs; focus ring `--kb-focus-ring` 2px. All values below reference `--kb-*` tokens only.

**Wireframe glyph convention (READ FIRST — for `/fe`):** the ASCII wireframes below use placeholder symbols `[ic]` and quoted glyph *names* (e.g. `glyph-project`) to mark where an **inline SVG icon** goes. The repo's `no-tofu-glyphs` source-scan test forbids the literal characters `＋ ◧ ‹ › ▯` (and any non-typographic non-ASCII) in component source. **Do NOT paste any wireframe symbol into a template** — every icon position resolves to one of the inline-SVG glyphs catalogued in §4. The wireframes are diagrams, not markup.

---

## 1. Updated Project Card (Projects Home)

Keep the current card. Add a **short description** (1–2 lines, distinct from the long one on the shell) and a **representative project glyph**, and surface the at-a-glance pulse the studio vision promised (task count). The card stays a single router-link.

### 1.1 Wireframe — populated card

```
┌──────────────────────────────────────┐
│ ┌────┐                            ⋯  │   ← 36px rounded glyph tile (accent-tinted)
│ │ ◧  │  payments-api                  │     + title (1.125rem, 600)
│ └────┘                                │
│ ┌Java┐ ┌Spring┐ ┌Docker┐             │   ← stack chips (existing)
│                                        │
│ VAT-aware billing & invoicing for      │   ← SHORT description, clamp 2 lines,
│ UK merchants.                          │     plain prose (NEW emphasis)
│                                        │
│ ────────────────────────────────────  │   ← hairline divider (--kb-border)
│ ● connected      ☑ 12 · 2 need you     │   ← status (colour+glyph+text) + task pulse
│ updated 2h ago                         │
└──────────────────────────────────────┘
```

- **Glyph tile (NEW):** a 36×36 rounded-rect tile, `background: --kb-accent-soft`, holding the existing monoline "project" glyph in `--kb-accent`. Gives the card a visual anchor and a place the stack could later theme. Single inline SVG (see §5, `glyph-project`).
- **Short description:** `profile.description` clamped to **2 lines** here (`-webkit-line-clamp:2`). The long form lives on the shell. If empty → italic `--kb-text-subtle` "No description collected yet." (keep current empty copy).
- **Task pulse (NEW, optional):** when `state` is available, a compact `☑ {open} · {needsYou} need you` chip. `need you` only shows when `> 0`, coloured `--kb-warning` with the `⧗` glyph + text. Omitted entirely when counts are unknown (don't show zeros for missing data).
- **`⋯` overflow (NEW, low priority):** top-right kebab for per-card actions (Rename, Re-analyse, Remove) — a `<button>` ≥24px that opens a menu; not on the link's activation path (stop-propagation). Optional for this slice.
- Hover/focus unchanged: lift `translateY(-2px)`, border → `--kb-border-strong`, 2px focus ring.

### 1.2 States

| State | Treatment |
|---|---|
| Loading (profile not yet hydrated) | skeleton: title bar + 2 grey description lines (shimmer; static stripe under reduced-motion) |
| No description | italic subtle line (current copy) |
| No stack detected | chips row omitted (no empty container) |
| Status `analyzing` | dot `--kb-warning` + text "analysing"; task pulse hidden |
| Status `error`/`offline` | dot `--kb-danger`/subtle + text; card still navigable |

### 1.3 Data the card needs (per project)
- From `profile`: `title`/`titleOverride`, **`description`** (short, cleaned prose), `stack[]`, `status`.
- From `state` (already available): a **task summary** — see §6.1. The card needs only `{ open, needsYou }`; the full breakdown is for the shell.

---

## 2. Connect / Add-project — the **folder-picker dialog** (Core-directory-browser interim)

Replace the free-text path field with an **"Add project" button → a folder-choosing dialog**. The hard constraint: a browser cannot read an absolute filesystem path from a native `<input type=file>` (security). The realistic interim is a **Core-served directory browser** — the local Node Core has FS access, so the Cockpit renders a navigable folder tree backed by a Core "list directory" endpoint. The eventual **native OS picker arrives with the Tauri desktop shell** (the `PlatformBridge` already abstracts host capabilities — see §2.5).

### 2.1 The Connect cell becomes a button

```
┌──────────────────────────────┐
│            ＋                  │   ← big plus glyph, accent
│      Add a project            │
│   Pick a folder on this       │
│   machine — we analyse it      │
│   right here.                  │
│   [  ＋ Choose folder…  ]      │   ← primary button → opens the dialog (§2.2)
└──────────────────────────────┘
```
Dashed-border cell preserved. The button is the only control; clicking it opens the **Folder Picker dialog** (a modal `<dialog>`, focus-trapped, `Esc` closes).

### 2.2 Folder Picker dialog — Core directory browser

```
┌──────────────────────────────────────────────────────────────┐
│  Choose a project folder                                ✕     │   modal header (sticky)
├──────────────────────────────────────────────────────────────┤
│  ⌂ Home  ›  oleh  ›  git  ›  workspace                        │   ← breadcrumb of current path
│  [⟵ Up]                              ⌕ filter folders…        │   ← Up button + in-list filter
├──────────────────────────────────────────────────────────────┤
│  QUICK ACCESS                                                 │
│   ⌂ Home              /home/oleh                              │   ← roots from Core (§6.3)
│   ◧ Recent: ai-dev-team   /home/oleh/git/workspace/ai-dev-team│
├──────────────────────────────────────────────────────────────┤
│  FOLDERS IN  /home/oleh/git/workspace                        │
│   ▸ 📁 ai-dev-team                          ● has project*    │   ← *already analysed marker
│   ▸ 📁 payments-api                                          │
│   ▸ 📁 marketing-site                                        │
│   ▸ 📁 scratch                              (empty)          │
│   … (folders only; files hidden)                             │
├──────────────────────────────────────────────────────────────┤
│  Selected:  /home/oleh/git/workspace/ai-dev-team             │   ← live echo of pick
│  ☑ This folder already has analysed files — we'll pick those │   ← Kiro-style detection hint
│    up instead of re-initialising.                            │
│                                          [ Cancel ] [ Connect ]│   sticky footer
└──────────────────────────────────────────────────────────────┘
```

**Interaction model:**
- **Navigate in:** click/`Enter` a folder row → Core lists its children (`GET /api/fs/list?path=…`), breadcrumb + list update. **Navigate out:** `⟵ Up` or click a breadcrumb segment.
- **Start point:** dialog opens at Core-provided **roots** (`$HOME` first) + a **Recent** list (paths from the registry). No path typing required; an optional "advanced: paste a path" disclosure stays for power users but is collapsed by default.
- **Pick:** selecting a folder row sets it as **Selected** (highlighted, `aria-selected`); `Connect` is enabled only when a folder is selected. Double-click = navigate in; single-click = select. A row carries a small **`▸` affordance** to drill in vs. an explicit **Select** on the row body — to avoid the "click to open vs click to choose" ambiguity, the row is **select-on-click, drill-on-the chevron/double-click**, and the footer always shows what's selected.
- **Filter:** the `⌕ filter folders…` box filters the *current* listing client-side (cheap, no round-trip).
- **Already-analysed detection (Kiro-style):** Core marks folders that already contain ADT artefacts (`.aidevteam/` or a ledger) with a **`● has project`** badge; when the Selected folder is one of these, the footer shows the **"we'll pick those up"** hint so the user knows connect will *adopt* rather than *init*.

### 2.3 Connect → analyse → ready/adopted (which happened)

On `Connect`, the dialog closes and the **Connect cell flips to the analysing state** (in place, the studio-vision pattern). The result must say **which path happened** — init vs adopt:

```
ANALYSING                          READY — INITIALISED            READY — ADOPTED (Kiro-style)
┌────────────────────────┐         ┌────────────────────────┐     ┌────────────────────────┐
│ ◧ ai-dev-team          │         │ ◧ ai-dev-team        ✓ │     │ ◧ ai-dev-team        ✓ │
│ Analysing folder…      │   →     │ Initialised — analysed │  or │ Adopted — found existing│
│ ✓ Detected stack       │         │ 8 files, indexed 8.    │     │ project (12 tickets,    │
│ ✓ Read README & docs   │         │ [ Open project → ]     │     │ 8 docs). [ Open → ]     │
│ ◐ Summarising…         │         └────────────────────────┘     └────────────────────────┘
│ ○ Indexing for memory  │
│ [ Cancel ]             │
└────────────────────────┘
```

- The **result badge** distinguishes the two outcomes explicitly: **"Initialised"** (`created:true`, source `analysis`) vs **"Adopted — found existing project"** (`created:false` or source `artefacts`). Backend already returns `created` on connect (§6.4) and `profile.source` — surface both as the deciding signal.
- A one-time toast mirrors it: `ai-dev-team adopted — 12 tickets, 8 docs ready →`.
- **Error / partial:** keep current error card copy ("Couldn't connect that folder.") + Retry; for a *soft* failure (e.g. indexing step failed) offer **Open anyway** and let Base show which docs are unindexed.

### 2.4 Dialog states

| State | Treatment |
|---|---|
| Loading a directory | row skeletons (4–6 shimmer rows) inside the list region; breadcrumb stays |
| Empty directory | "No sub-folders here." + Up button; Connect still works on the current folder if selectable |
| FS list error (permission/denied) | inline row-region alert "Couldn't read this folder ({reason})." + Up; never crash the dialog |
| No roots returned | fall back to the advanced "paste a path" disclosure (graceful degradation) |

### 2.5 The later upgrade — native OS picker (Tauri)
The `PlatformBridge` abstraction (already in the cockpit core) gains a `pickDirectory(): Promise<string | null>` capability. In the **web/dev host** it resolves to the Core-directory-browser dialog above; in the **Tauri host** it calls the **native OS folder picker** and returns the absolute path directly (no Core listing needed). The Connect flow is identical downstream — only the *picking* mechanism swaps. Design both so the Connect cell's button label and the analysing/ready states are host-agnostic.

---

## 3. Redesigned Project Shell

A **long description header** at the very top, then the **three substantive panels** — each with real data + a representative inline-SVG icon. The current "coming soon" placeholders are replaced with first-cut *read* surfaces (the heavy interactive builders/boards remain later tickets; these panels are summaries with entry points).

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ Projects     ┌──┐  payments-api                              ⚙   ● connected │  header bar
│                │◧ │                                                            │
│                └──┘                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ A VAT-aware billing & invoicing service for UK merchants. Generates       │ │  LONG description
│  │ compliant invoices, handles refunds, and reconciles payments against      │ │  (full prose, wraps,
│  │ orders. Java 21 · Spring Boot 3 · Postgres.                  [ ✎ edit ]   │ │   not truncated)
│  └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐             │
│  │  ◧ WORKFLOW       │  │  ☑ TASKS          │  │  ▤ BASE           │            │
│  │  (panel §3.3)     │  │  (panel §3.4)     │  │  (panel §3.5)     │            │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘             │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Header:** back link + glyph tile + title + `⚙` settings + live `●` connection dot (reuse Hub `live` dot). Title and `⚙` stay on one row; description moves to its **own full-width block below** (no more single-line truncation — the feedback explicitly wants the long description visible).
- **Long description block:** full `profile.description` (cleaned prose), wraps to as many lines as needed, `max-width: 60rem` for readability, `--kb-text-muted`. An **`✎ edit`** affordance writes `descriptionOverride` (the model already supports overrides) — optional for this slice. Untrusted-source rule preserved (interpolation only).
- **Panels:** 3-up grid on `≥lg`, 2-up on `md`, stacked on `sm` (reuses the existing `repeat(auto-fit, minmax(...))`). Each panel is a card (`--kb-surface`, `--kb-border`, `--kb-radius-lg`) with a **header row (icon + title + count)**, a **body of real data**, and a **footer entry-point link**.

### 3.2 Panel anatomy (shared)

```
┌────────────────────────────────┐
│ ⬡icon  TITLE              ⓘ N   │  ← icon tile + title + headline count/badge
│ ──────────────────────────────  │
│  …panel-specific body…          │  ← the substance (counts / diagram / doc facts)
│                                 │
│ ──────────────────────────────  │
│  Open {area} →                  │  ← footer link (router or in-shell nav)
└────────────────────────────────┘
```
Icon sits in a 28–32px rounded tile tinted with the **area hue** (Workflow→accent, Tasks→`--kb-success`-tinted, Base→a neutral/violet tint) so the three panels read as distinct at a glance while staying on-palette.

### 3.3 WORKFLOW panel — read-only visual of the process

A **simple, read-only diagram** of this project's workflow: the active **track's stages** as a left-to-right pipeline, each stage tagged with its **gate** (if any) and **owner agent**. This is *not* the interactive editable builder (that's later) — it's a viewable "here's how this project's process flows."

```
┌────────────────────────────────────────────────────────────┐
│ ◧ WORKFLOW                                  track: full     │
│ ──────────────────────────────────────────────────────────  │
│                                                              │
│  ⚡         ◆          ◆          ◇          ◆       ✓        │
│ vision → architecture → security → approval → code  → done   │
│  /po      /arch ⛨hard   /secops    gate ⛨    review          │
│           ARCH_APPR…    🔒SECOPS    APPROVAL  /rev ⛨          │
│                                                              │
│  ⛨ = gate (solid=hard / dashed=soft)   ◆ agent  ◇ gate-step  │
│ ──────────────────────────────────────────────────────────  │
│  View full workflow →                                        │
└────────────────────────────────────────────────────────────┘
```

- **Minimal visual that conveys the flow:** a horizontal **stage chip rail** with connector arrows. Each chip shows the **stage name**, its **owner agent** (◆ glyph + `/role`), and a **gate marker** (`⛨` solid border = hard, dashed = soft) when the stage has a governing gate. Reuses the Hub's stage-hue tokens per stage so each step is colour-coded (colour + the stage label text, never colour alone).
- **Compact by default:** show the **active track** (`state.tracks[activeTrack]`); on narrow widths it becomes a vertical list. A `View full workflow →` link goes to the future full Workflow view; until that ships it can scroll the rail / show all tracks.
- **Why this and not the builder:** it's purely derived from data Core already returns (`tracks`, `gateDefs`, `stageOwners`) — zero new editing surface, buildable now as inline SVG + chips.
- **Empty/edge:** if no workflow resolved, show "Using the default solo workflow." + the floor track. If `track` unknown, default to the longest defined track.

### 3.4 TASKS panel — counts by status + entry point

An at-a-glance **status summary**, derived from `state.tickets[].status`.

```
┌────────────────────────────────────────────┐
│ ☑ TASKS                              14     │  ← total
│ ──────────────────────────────────────────  │
│   ▣ 8   in progress     ⧗ 2   need you      │
│   ⛔ 1   blocked        ✓ 3   done          │
│  ──────────────────────────────────────────  │
│  ▓▓▓▓▓▓▓▓▒▒▒▒▒▒  (stacked mini-bar by status)│  ← one-line proportion bar
│ ──────────────────────────────────────────  │
│  Open board →                                │
└────────────────────────────────────────────┘
```

- **Counts by status (colour+glyph+text):** `in_progress ▣` (accent), `needsYou ⧗` (`--kb-warning`), `blocked ⛔` (`--kb-danger`), `done ✓` (`--kb-success`), plus `waiting ●` (subtle) folded into "in progress" or shown if non-zero. "**Need you**" = tickets whose `status` indicates a human/agent is awaited (derive from `status` + `expectedOwner`/gate-rejected; see §6.1).
- **Mini proportion bar:** a single horizontal stacked bar showing the status mix — a quick visual of "how much is done vs blocked." Each segment carries an `aria-label` with its count (bar is decorative; the numbers above are the source of truth).
- **Entry point:** `Open board →` to the future Tasks board.
- **Empty:** "No tasks yet — the team will create them as work starts." (no zeros grid).

### 3.5 BASE panel — how many docs indexed + how, and an invite to add

```
┌────────────────────────────────────────────┐
│ ▤ BASE                               8 docs │
│ ──────────────────────────────────────────  │
│   ✓ 8 indexed   ◐ 0 indexing   ⚠ 0 failed   │  ← index status counts
│   Indexed via: local embeddings (semantic)  │  ← HOW they're indexed
│   ┌─ recent ──────────────────────────────┐ │
│   │ • code-rules        ✓ indexed         │ │  ← a few representative docs
│   │ • test-policy       ✓ indexed         │ │
│   │ • project-context   ✓ indexed         │ │
│   └───────────────────────────────────────┘ │
│ ──────────────────────────────────────────  │
│  [ ＋ Add documents ]      Manage base →     │  ← invitation + entry point
└────────────────────────────────────────────┘
```

- **Count + how:** headline `N docs`, then a breakdown `✓ indexed / ◐ indexing / ⚠ failed`, and a **method line** ("Indexed via: local embeddings (semantic)" or "Filename index only" when no embedder is configured) so the user understands *how* recall works.
- **Invitation to add:** a primary **`＋ Add documents`** button (sets the future-doc expectation; for this slice it can open a "paste/markdown" add flow or, if not built, link to the docs folder). `Manage base →` to the future Base view.
- **Empty:** "No knowledge yet — add the rules and context your team must follow." + the same Add button (per anti-pattern: never bare "No data").
- **Edge:** if Core only knows filenames (today's `kb[]`), show the count + "Filename index only — connect an embedder for semantic recall" rather than faking an indexed state.

### 3.6 Shell states

| Surface | Loading | Empty | Error |
|---|---|---|---|
| Header | title skeleton bar | n/a | "Couldn't open this project: {err}" banner |
| Long desc | 2 skeleton lines | "No description collected yet." | — |
| Workflow panel | rail skeleton | "Default solo workflow." | "Couldn't load workflow." |
| Tasks panel | count skeletons | "No tasks yet." | "Couldn't load tasks." |
| Base panel | row skeletons | "No knowledge yet." + Add | "Couldn't load base." |

A panel error is **isolated** — one panel failing never blanks the others (each fetches/derives independently or all from one `state` payload with per-panel try).

---

## 4. Iconography — exact inline-SVG specs (no icon library)

All icons: **24×24 viewBox**, `stroke="currentColor"`, `stroke-width≈1.6`, `fill="none"` (monoline), `aria-hidden="true"`, colour inherited from context (accent in tiles, currentColor in text rows). Small "illustration" tiles = the glyph centred in a rounded-rect tile filled with the area's tinted token.

| Name | Where | Description (build as inline SVG) |
|---|---|---|
| `glyph-project` ◧ | card + shell header tile | Rounded rect (the existing one): `rect 3,4.5 18×15 rx2` + vertical divider line at x=10 — a "panelled window". **Already in the codebase; reuse.** |
| `glyph-plus` ＋ | Add-project button | Two 2px capped crossing lines (existing connect glyph). Reuse. |
| `glyph-folder` 📁 | picker rows, breadcrumb home | Classic folder: a rect body with a small tab notch top-left (`M3 7 h5 l2 2 h11 v10 a1 1 0 0 1-1 1 H4 …`). Open variant (front flap skewed) for the *current* folder. |
| `glyph-home` ⌂ | picker Quick Access | House: triangle roof (`polyline 3,11 12,4 21,11`) over a square body. |
| `glyph-chevron-up` ⟵/▴ | picker "Up", drill affordance | Single chevron (`polyline 6,14 12,8 18,14`), rotated per direction. |
| `glyph-workflow` ◧→ | Workflow panel tile | Three small nodes connected by arrows: `circle` · `→` · `circle` · `→` · `circle` (a tiny pipeline) — reads as "process flow". |
| `glyph-gate` ⛨ | Workflow stage gate marker | A shield outline (`M12 3 l7 3 v5 c0 5-3 7-7 9 c-4-2-7-4-7-9 V6 z`). **Solid stroke = hard gate; dashed stroke (`stroke-dasharray:3 2`) = soft gate** — shape carries hard/soft, not colour alone. |
| `glyph-agent` ◆ | Workflow owner + task agent | Small diamond (`rect rotated 45°` or `path M12 4 L20 12 L12 20 L4 12 Z`); paired with the `/role` text. |
| `glyph-tasks` ☑ | Tasks panel tile | Checklist: a small square with a check + two ruled lines beside it. |
| `glyph-status-progress` ▣ | Tasks count | Half-filled square / spinner-arc (static). |
| `glyph-status-need` ⧗ | Tasks "need you" | Hourglass (two stacked triangles) — universally "waiting on someone". |
| `glyph-status-blocked` ⛔ | Tasks blocked | Circle with a diagonal bar (no-entry). |
| `glyph-check` ✓ | done / indexed | Single check `polyline 5,12 10,17 19,7`. Reuse everywhere "done/indexed". |
| `glyph-base` ▤ | Base panel tile | Stacked documents: two overlapping rounded rects with 2–3 short text lines — "a small library". |
| `glyph-index` ◐ | Base "how indexed" | Concentric/“radar” arc or a magnifier over dots — connotes "semantic / searchable". (Use a magnifier `circle + line` if simpler.) |
| `glyph-warning` ⚠ | failed states | Triangle with `!` (`path` triangle + line + dot). |
| `glyph-settings` ⚙ | shell header | Gear: a circle + 8 short radial teeth (or the simpler 6-tooth path). |
| `glyph-edit` ✎ | edit description | Pencil (`M4 20 l1-4 L16 5 l3 3 L8 19 z`). |

**Illustration tiles (small, tasteful):** each panel header uses its glyph inside a `28–32px` rounded tile (`--kb-radius-md`) filled with the area tint (`--kb-accent-soft` for Workflow; a success-tinted bg for Tasks; a neutral/violet tint for Base). No external assets, no `<img>` — pure inline SVG so it themes with the tokens and passes the no-tofu / no-unsafe-binding tests already in the suite.

---

## 5. Accessibility (WCAG 2.2 AA) — notes

- **Colour never alone:** every status (card, tasks counts, workflow gates, base index) pairs an inline-SVG **glyph + text**. Hard vs soft gate is encoded by **stroke style (solid/dashed)**, not hue.
- **Contrast:** body text uses `--kb-text` (≥4.5:1 on `--kb-surface`); `--kb-text-muted` only for ≥large/secondary; the two earlier cockpit contrast fixes are preserved — re-verify the **Tasks mini-bar segments** and the **panel tint tiles** against text/borders at ≥3:1 for UI components. New tinted tiles must keep their glyph ≥3:1 against the tile fill.
- **Folder picker dialog:** native `<dialog>` (or role="dialog" + `aria-modal`), **focus trapped**, `Esc` closes, focus returns to the "Choose folder…" button. The folder list is a **`role="listbox"`** of `role="option"` rows (`aria-selected`), keyboard: `↑/↓` move, `Enter`/`→` drill in, `Backspace`/`←` go up, `Enter` on a selected folder confirms. Breadcrumb segments are buttons. **Dragging not required** anywhere. Selected path announced via `aria-live="polite"`.
- **Targets:** all interactive ≥24px (≥44px under `pointer:coarse`) — picker rows, kebab, panel links, Add button.
- **Focus:** 2px `--kb-focus-ring`, 2px offset, ≥3:1; sticky modal header/footer use `scroll-margin` so focus isn't obscured (2.4.13).
- **Workflow diagram a11y:** the SVG rail is decorative; provide a **text alternative list** ("vision (/po) → architecture (/arch, hard gate) → … → done") as an `aria`-exposed ordered list / `aria-label`, so screen readers get the flow without the spatial graph.
- **Reduced motion:** card lift, panel hovers, analysing shimmer, and any token/animation respect `prefers-reduced-motion` (shimmer → static stripe; no essential info conveyed by motion).
- **Async announcements:** connect analysing/ready/error and dialog list loading use `role="status"`/`role="alert"` + `aria-live` (the connect panel already does this — extend to the dialog).
- **Untrusted text:** `title`/`description`/folder names render via Angular interpolation only (escaped) — never `[innerHTML]`. The repo's `no-unsafe-binding` source-scan test stays green.

---

## 6. New backend data the Core must expose (for `/be`)

Most panels derive from data the hub **already returns** (`tickets[].status`, `tracks`, `gateDefs`, `stageOwners`, `kb[]`, `profile`). The genuinely *new* asks:

### 6.1 Task status counts (Tasks panel + card pulse)
Add a derived **summary** to the project-detail `state` (or a `GET /api/projects/:id/tasks/summary`):
```jsonc
"taskSummary": {
  "total": 14,
  "byStatus": { "in_progress": 8, "waiting": 0, "needsYou": 2, "blocked": 1, "done": 3 }
}
```
- `needsYou` = tickets awaiting a human/owner decision — derive from existing signals: a **hard gate in `rejected`** state, or `status === 'waiting'` with an `expectedOwner` and no active agent. Core owns the exact rule; UI just renders the counts. (Cockpit could compute this client-side from the existing `tickets[]`, but a Core-owned `taskSummary` keeps the card cheap — list view doesn't fetch every ticket.)

### 6.2 Read-only workflow graph projection (Workflow panel)
Already derivable from `state.tracks` + `gateDefs` + `stageOwners`, but expose a **flattened, render-ready** shape so the cockpit doesn't re-join three maps:
```jsonc
"workflowView": {
  "activeTrack": "full",
  "stages": [
    { "stage": "vision", "owner": "/po", "gate": null },
    { "stage": "architecture", "owner": "/arch", "gate": { "name": "ARCH_APPROVED", "refusal": "hard" } },
    { "stage": "security", "owner": "/secops", "gate": { "name": "SECOPS_APPROVED", "refusal": "hard" } },
    { "stage": "done", "owner": null, "gate": null }
  ]
}
```
Read-only; no editing endpoints in this slice.

### 6.3 Directory listing endpoint (folder picker — the interim)
A **read-only** Core endpoint the dialog drives:
```
GET /api/fs/list?path={absDir}        → { ok, path, parent, entries:[{ name, type:'dir', hasProject:bool }] }
GET /api/fs/roots                      → { ok, roots:[{ label:'Home', path }], recent:[{ label, path }] }
```
- **Folders only** in `entries` (files hidden); `hasProject` = the dir already contains ADT artefacts (`.aidevteam/` or a ledger) → drives the "● has project" badge + the adopt hint.
- **Security (critical, for /secops + /be):** this hands FS read to the browser, so it MUST: require the **write/access guard header** the cockpit already sends; **resolve + realpath** every `path` and confine to allowed roots (no escaping `$HOME` / a configured allowlist; refuse `..` traversal and symlinks that escape); return **names + type only** (never file contents); rate-limit. Mirror the containment caps `analyze.js` already enforces. `roots`/`recent` come from `$HOME` + the registry.

### 6.4 Connect result — init vs adopt (already mostly present)
Connect already returns `created` and `profile.source` (`analysis` = initialised, `artefacts` = adopted). Surface both so the cockpit can show **"Initialised"** vs **"Adopted — found existing project"** and the ticket/doc counts. Add the post-connect **`taskSummary`** + **base doc counts** to the connect response so the ready-card can show "12 tickets, 8 docs" without a second round-trip.

### 6.5 Base doc index facts (Base panel)
Extend the existing `kb[]` from `{name, file}` to carry **index status + method**:
```jsonc
"base": {
  "method": "local-embeddings",          // or "filename-only" when no embedder configured
  "counts": { "indexed": 8, "indexing": 0, "failed": 0 },
  "docs": [{ "name": "code-rules", "file": "docs/code-rules.md", "index": "indexed" }]
}
```
- If no embedder is wired, `method:"filename-only"` and `counts.indexed` = file count — the panel honestly says "Filename index only".
- An **add-document** write endpoint is a later ticket; for this slice the Add button can link to the docs folder or open a paste-markdown flow if cheap.

### 6.6 (Cosmetic but real) description cleanup
The analyzer's `description` currently leaks raw README markdown (badge image syntax) for repos whose README opens with badges. Core should **strip markdown image/badge/link syntax to plain prose** (or fall back to the first prose paragraph) so the card/shell show clean text. UI keeps escaping it regardless.

---

## 7. Buildability (single FE dev, Angular 21 + inline SVG)

- **Card:** add a glyph tile (existing SVG), a 2-line short description (CSS clamp already present), and a task-pulse chip bound to `taskSummary` — all token-based, no deps.
- **Folder picker:** one focus-trapped `<dialog>` component + a `FsService` calling the two `/api/fs/*` endpoints; a `role=listbox` folder list; reuses the existing connect analysing/ready states. The `PlatformBridge` gains `pickDirectory()` so Tauri swaps in the native picker later with no downstream change.
- **Shell:** replace the three "coming soon" panels with three data panels reading one `state`/detail payload (workflowView, taskSummary, base). Inline-SVG icon tiles per §4. The mini proportion bar is a flex row of tinted segments (decorative + aria numbers).
- **No new runtime deps**, no icon library, no `[innerHTML]`. Existing tests (`no-tofu-glyphs`, `no-unsafe-binding`) constrain the work and stay green.
- **Suggested order:** (1) Card short-desc + glyph; (2) Add-project button + Folder Picker dialog + `/api/fs/*`; (3) Shell long-description header; (4) Tasks panel (counts — cheapest, data exists); (5) Workflow panel (read-only rail); (6) Base panel (needs §6.5).

---

## 8. Open questions for `/po`
1. **Folder-picker scope of roots:** confine to `$HOME` only, or an admin-configurable allowlist of roots? (security vs convenience trade-off — affects §6.3).
2. **Add-documents in this slice or later?** The Base panel *invites* adding docs; do we ship a minimal paste-markdown add now, or link to the folder and defer the write endpoint?
3. **Edit overrides (title/description) now or later?** Model supports `titleOverride`/`descriptionOverride`; the `✎ edit` affordances are optional for this slice.

**Status:** Draft → awaiting `/po` review. On approval, record `DESIGN_APPROVED` (soft) in the ledger and hand to `/fe` (panels) + `/be` (§6 endpoints), with `/secops` reviewing the `/api/fs/*` directory-browser surface (hard gate: it exposes filesystem reads to the browser).
```
