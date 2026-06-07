# Design QA — DART Cockpit "Projects Home" slice

**Verified by:** Aura (`/ui`)
**Date:** 2026-06-07
**Branch:** `feat/dart`
**App:** `studio/cockpit/` (Angular 21.2)
**Spec under test:** `docs/product-vision/ui-design.md` — §2 Projects Home (launcher), §3 Project Shell, §8 state model, §9 accessibility, §10 responsive, §11 visual language.
**Method:** Ran the hub API + the Angular dev server against a temp `$HOME` (registry isolated; real `~/.aidevteam/registry.json` confirmed untouched), connected a rich fixture (README + `package.json`), and captured every state with headless Chromium (Playwright) at 1440 / 834 / 390 px. Screenshots: `./design-qa-screenshots/`.

> **Scope note (agreed):** This is the **first slice**. Workflow / Tasks / Base are intentionally placeholder panels; the Project Shell rail, Overview cards, live badges, and the connect step-checklist are **later tickets**. Nothing about those absences is scored as a defect — only deviations *within the slice's own remit* are flagged.

---

## 1. What conforms (PASS)

**Information architecture & layout (§2, §3)**
- Projects Home is exactly the spec's model: a responsive **card grid** with the **dashed "＋ Connect a project" cell always last**, and a dedicated **first-run empty state**. (`01-empty`, `05-populated`.)
- The **project card** carries the spec's anatomy: ◧ glyph + title, detected **stack chips** (`node`), the **auto-collected description** clamped to ~3 lines, a **status label**, and a **last-updated** stamp. The whole card is one router link into the shell. (`05-populated`.)
- **Project Shell** header shows back-affordance ‹ Projects + ◧ glyph + **title + truncated description** (full text in `title=` tooltip), with **Workflow / Tasks / Base** placeholder panels — matches §3 intent for this slice. (`07-shell`.)
- Description hydration works end-to-end: README/`package.json` text surfaces on both the card and the shell header, escaped (interpolation-only — XSS-safe per the source contract).

**Visual language (§11)**
- Dark theme honoured: layered surfaces by **elevation, not shadow** (`--kb-bg #0B0D12` page → `--kb-surface #14171F` cards), the **gradient header with the accent dot**, and rounded 12px cards. Reads as the intended extension of the Hub canon.
- **Accent = active/live reservation** is respected in this slice: purple is used only for the brand pulse dot, the ＋ affordance, the in-progress spinner, and focus rings — not sprayed onto static chrome.
- **Status is never colour-alone (§9):** every status pairs a colour dot with a **text label** ("connected"), and the connected/analyzing/error/offline dots map to success/warning/danger/subtle tokens. Good.
- Typography hierarchy is clean (display for headings, muted for secondary), spacing uses the token scale consistently.

**Interaction states (§8)**
- **empty / analyzing / ready / error** are all present and legible. Empty = glyph + one-line value prop + single CTA (passes the "never just 'No data'" rule). Analyzing = spinner + "Analysing project…" + a trust line. Error = bold label "Couldn't connect that folder." + red detail ("path does not exist") + **Try again**. Ready cross-fades into a populated card. (`04-analyzing`, `09-error`.)
- The **in-place connect flow** (card itself is the progress surface) matches the spec's intent — the user keeps context through analyse → ready/error.
- `role="status"`/`aria-live="polite"` on the analyzing block and `role="alert"` on the error block — correct live-region semantics.

**Accessibility — focus & keyboard (§9)**
- **Focus visibility is a highlight:** a consistent 2px accent ring (`:focus-visible`, 2px offset) on the path input, the Connect button, *and the entire project card* (it's a real `<a>`, so keyboard-reachable and operable). (`02-empty-input-focus`, `06b-card-focus`.) Focus ring contrast vs surface = **5.8:1** (≥3:1 ✔).
- Connect form is fully keyboard-operable; input has a real `<label for>` + `aria-describedby` hint; cards have descriptive `aria-label`.
- `prefers-reduced-motion` is globally honoured (animations/transitions zeroed) — covers the spinner and card hover lift.

**Responsive (§10)**
- 1440 → multi-col; **834 → 2 cols**; **390 → single column** with card + connect panel stacked, and the shell panels stacking vertically. No overflow, no clipped controls, touch targets intact. (`10`, `11`, `12`.) Grid uses `auto-fill minmax(17rem,1fr)` — fluid and correct.

---

## 2. Deviations & papercuts

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| D1 | **Primary "Connect" button fails text contrast** | **should-fix** | White text on `--kb-accent #6E8BFF` = **3.09:1** (needs ≥4.5:1 for this ~16px/600 label; it is not "large text"). The most important CTA in the slice is the one element below AA. Fix: darken the accent used as a *button fill* (e.g. an `--kb-accent-strong` around `#4F6BE8`) or switch the label to a dark foreground. Affects the enabled Connect button on every breakpoint. |
| D2 | **`--kb-text-subtle #6B7280` fails normal-text contrast** | **should-fix** | 3.71:1 on `--kb-surface` / 4.02:1 on `--kb-bg` (needs 4.5:1). Used for the card footer ("updated just now"), the empty-description italic ("No description collected yet."), and the panel "coming soon" hints. It's secondary text, but it's still body-sized informational copy. Nudge the token lighter (≈`#8A91A0`) to clear AA. |
| D3 | **Analyzing state is a bare spinner, not the spec's step-checklist** | nice-to-have (this slice) | §2.2 specifies a streaming **✓ checklist** (Detected stack → Read README → Summarising → Indexing) + a determinate bar, precisely so a long analysis "feels honest and inspectable." The implementation shows only a spinner + one line. Acceptable for a fast local fixture and a first slice, but the honesty-of-progress affordance is the spec's deliberate choice — track it for when analysis gets slower (embeddings/indexing). |
| D4 | **Error state omits the spec's recovery branch + glyph** | nice-to-have | §2.4 calls for a `⚠` glyph and a **two-way** recovery — *Retry* **and** *Open anyway* ("never block entry on a soft failure"). The build offers a single **Try again** and no ⚠ glyph. For a hard "path does not exist" failure (no project created), a single retry is reasonable; the **Open anyway** path only becomes meaningful once a *partial* analysis exists, so this is correctly deferred — but add the ⚠ glyph so the error isn't carried by red colour + text weight alone. |
| D5 | **Status label shows the raw enum, not a humanised phrase** | nice-to-have | The card prints the status verbatim (`connected`); the spec's mini-status vocabulary is richer ("workflow idle", "updated 2h ago"). For `needs-auth` the literal token would read as `needs-auth` rather than "Needs sign-in". Map statuses to human strings before the richer mini-status lands. |
| D6 | **Free-text folder field instead of a picker** | acknowledged / no action | The spec's "Choose folder…" native picker is an explicitly **deferred host capability** (PlatformBridge). The text field is the correct cross-platform floor for now; the inline comment documents this. The placeholder (`/path/to/your/project`) and trust line ("We never upload your code…") read well. Papercut only: there's no inline validation/affordance hinting that an *absolute* path is expected — surfaced only on submit via the error. Low priority. |
| D7 | **Empty-state CTA is the full Connect panel, not the spec's single button** | nice-to-have | §2.3 shows one primary "＋ Connect your first project" button; the build embeds the whole connect form in the empty state. This is arguably *better* (one less click) and still single-purpose, so I'd keep it — noting only that it diverges from the literal wireframe. |

No **blockers**. Nothing in the slice is broken, mislabelled, inaccessible-by-keyboard, or off-theme.

---

## 3. Accessibility scorecard (WCAG 2.2 AA, design lens)

| Check | Result |
|---|---|
| Status not by colour alone | **PASS** — colour + text label everywhere |
| Focus indicator (2px, ≥3:1) | **PASS** — 5.8:1, visible on input, button, and cards |
| Keyboard reachability (connect form + cards) | **PASS** — labelled form; cards are real links |
| Body text contrast ≥4.5:1 | **PARTIAL** — primary text 16.3:1 ✔, muted 7.8:1 ✔, but **subtle token 3.7:1 (D2)** ✗ |
| UI component contrast ≥3:1 | **PASS**, except **Connect button label 3.09:1 (D1)** ✗ |
| Live regions for async states | **PASS** — `aria-live`/`role=alert` present |
| Reduced motion | **PASS** — global override |
| Touch targets ≥24px | **PASS** at all breakpoints |

---

## 4. Verdict

### DESIGN_APPROVED (soft) — with a 2-item punch list before this slice is "done-done"

The Projects Home + Project Shell slice is a faithful, well-built realisation of the spec's IA, dark visual language, accent-reservation discipline, state model, and responsive behaviour. Focus handling and colour-not-alone are genuinely strong. The placeholders are correctly scoped.

**Must address (should-fix, both pure token tweaks — no structural change):**
1. **D1** — raise the Connect button label contrast to ≥4.5:1 (darken the button-fill accent or flip the label colour).
2. **D2** — lighten `--kb-text-subtle` to clear 4.5:1 on surface.

**Track for the next slice (nice-to-have):** D3 step-checklist, D4 ⚠ glyph + Open-anyway on partial failures, D5 humanised status strings.

Once D1 + D2 land, this slice is design-clean and clear to proceed to `/qa` / `/verify`.

---

*Environment cleaned up: hub + dev servers stopped, all test ports released, temp `$HOME` used throughout (real registry verified unpolluted). Screenshots retained at `./design-qa-screenshots/` for the record.*
