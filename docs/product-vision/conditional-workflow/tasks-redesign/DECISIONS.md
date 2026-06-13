# Tasks-view redesign — Decisions (ADT-244)

**Ticket:** ADT-244 · **Owner of these decisions:** /po (Max), recorded by /sm (Luda)
**Date:** 2026-06-13
**Source:** user-ratified 5-agent investigation —
[aura-ui.md](aura-ui.md) · [anna-research.md](anna-research.md) · [jorge-arch.md](jorge-arch.md) · [max-product.md](max-product.md) · [apex-usability.md](apex-usability.md)

The Tasks board organises its centre by workflow **stage**, but tickets cluster at the lifecycle ends (backlog / done), so the middle is a structurally empty void. The approved fix changes the *organising principle of the default view*, not the column widths.

---

## D-1 — The DEFAULT Tasks view is a needs-you-first WORKLIST (decisive)

Opening Tasks lands on a worklist whose centre always shows the **actual tickets as real cards**, grouped **Needs-you → In-flight → Backlog → Recently-done**, reflowing to fill any width. The centre is never an empty stage scaffold at any width.

**Why:** in an autonomous agent flow the human's whole role is the needs-you queue, and most work sits in backlog/done — exactly the distribution that breaks a stage-keyed centre. A worklist is useful precisely when the pipeline is empty. (max-product §3.1; aura-ui §1–2; apex-usability §0–1.)

**Category:** Product · **Authority:** /po

## D-2 — The stage Pipeline is the SECONDARY mode, not the landing

The existing adaptive "train" (stage stations + expanded populated columns, off-track lane, advance, gates, live SSE re-layout) is **preserved and behaviour-unchanged**, but demoted from default to an opt-in view **mode**. It is not thrown away — it is genuinely the best read when work is flowing.

**Category:** Product · **Authority:** /po

## D-3 — Auto-default to Pipeline only when work is genuinely mid-flow; remember the choice

Mode auto-defaults to **Pipeline only when ≥2 stages are simultaneously populated**; otherwise it defaults to the **Worklist**. The operator's explicit mode choice is **remembered per project** and survives live SSE pushes within a session. No hidden mode the user can get stuck in.

**Category:** Product · **Authority:** /po (mode-switch vs self-weighting ruled in favour of two clean modes — aura-ui §9 alternative declined for the primary)

## D-4 — Every card action stays the guarded control-plane write; a view is a lens

advance / approve / reject / comment remain the **existing guarded CAS write** (current rev, safety-gate refusal, 409 surfaced — never a silent overwrite), in **every** mode. Switching views is client-side regroup only: no server round-trip, no new write path. `status` is a derived, read-only axis — no view edits it directly. (jorge-arch §5, R2.)

**Category:** Architecture · **Authority:** /arch (analysed), /po (ratified as a hard product guardrail)

## D-5 — needs-you parity: the hub predicate is canonical, the FE mirrors it

Today `needsHumanDecision` (hub) raises on a rejected hard gate **and** on `status=waiting + expectedOwner + !active`; the FE `ticketNeedsYou` raises **only** on the rejected hard gate — a latent drift. The **hub predicate is canonical** (the `taskSummary` count and projects-home roll-up already use it); the FE mirrors it exactly so the needs-you group, the chip, the count, and the roll-up agree on one set. (jorge-arch §3 rule 4, §7 R1.)

**Category:** Architecture · **Authority:** /arch (flagged), /po (in MUST scope)

## D-6 — Honest, calm quiet/empty states (absent-not-zero)

needs-you is **absent-not-zero** — loud only when >0, never "0 need you"; the absence of the warning *is* the all-clear. A quiet centre reads as a calm at-rest state ("Pipeline's clear — work is queued in the Backlog…" / "…everything's shipped to Done.") — never an apology, fake zero, fake urgency, or "no data". A truly-empty project keeps its own sell-and-teach empty state. At most one region shouts at a time. (apex-usability §1–3.)

**Category:** Product · **Authority:** /po (ratifies the calm-verdict reframe as the locked framing; "Done" stays the terminus word)

---

## MVP scope (MoSCoW)

**MUST (v1):**
1. The needs-you-first **worklist is the DEFAULT** and the centre is never an empty void at any width.
2. The four groups in order — **Needs-you** (first, the human-decision set) · **In-flight** (owning /agent + why-routed) · **Backlog** (reachable) · **Recently-done** (collapsed teaser); empty groups absent.
3. **Adaptive fill** — cards reflow to fill the width (multi-column grid → fewer/one column as width shrinks, no horizontal-scroll cliffs); reuse the existing card.
4. The **Worklist ⇄ Pipeline mode toggle** (Pipeline = the existing adaptive train, behaviour unchanged).
5. **Honest calm empty/quiet states** (absent-not-zero, no fake zero / no apology).
6. **Guarded writes** — every card action stays the rev-checked CAS control-plane write, 409 surfaced.
7. **needs-you parity** — hub canonical, FE mirrors it.

**SHOULD (fast-follow):**
- Remembered mode choice per project (across sessions).
- Auto-mode: default to Pipeline only when work is genuinely mid-flow (≥2 stages populated).

**COULD (later):**
- `lastActivityAt` recency scalar (a derived projection field over the existing comment log) to enable a true "recently moved/done" ordering and recency sort.
- User-selectable grouping beyond the Worklist/Pipeline toggle (e.g. by-owner).

**WON'T (this release):** any view implying DART itself *runs* the agents; card-drag to advance past a gate; remote agent execution from the view.

---

## Classification & gates (per /sm via workflow-engine, `preset: solo`)

- **Change class:** standard (a feature/story; new client-side logic spanning files + a small parity fix) → **standard track**.
- **DESIGN_APPROVED** — soft; fed by the /aura build spec + the 5-agent investigation.
- **ARCH_APPROVED** — soft/triggered, **not hard**: presentational client-side re-projection over the existing `buildState` read-model (no new route/persistence/schema/boundary); the only structural change is the small needs-you-predicate parity cleanup, already analysed by /jorge.
- **SECOPS_APPROVED** — soft, **not hard**: no security trigger fires (presentational + a client-side regroup; the guarded write is unchanged; no new auth/secrets/PII/upload/input/network/crypto path).
- **CODE_REVIEWED** — **hard** (standard track).
- **VERIFIED** — **hard** (final completeness audit on the production build, served same-origin).

**Implementers:** /fe owns the view; a small /be canonicalises the hub `needsHumanDecision` predicate if the parity fix needs a hub-side change (the FE mirrors the canonical predicate).
