# Projects Home — Live Cross-Project Rollup (DESIGN)

**Author:** Aura (/ui) · **Surface:** `studio/cockpit` Projects Home
**Scope decision:** Extend the EXISTING `ProjectsHomeComponent` + `ProjectCardComponent`. **Do NOT build a new page.** Everything below is additive to surfaces that already ship.

---

## 0. The one-sentence job

A developer running several projects opens DART and, without clicking, sees **which project needs a human decision first** and **whether what they're looking at is fresh** — and when a project pushes an update, the home reflects it **calmly**, never a flashing dashboard.

That is two signals layered onto the existing home:
1. **Rollup (headline):** cross-project "needs you", sorted by urgency, already 80% built (the cockpit strip).
2. **Liveness (trust):** per-project freshness so a number on screen is believable, plus live re-flow of the counts.

---

## 1. Grounding — what already exists vs. what's missing

Read against the real code (`projects-home.component.ts`, `project-card.component.ts`, `projects.store.ts`, `models.ts`, `events.service.ts`, `project-shell.component.ts`):

| Already shipped | Where |
|---|---|
| Header signals strip: `{N projects}` + `{N need you}` (warning hue, absent-at-0), `aria-live="polite"` | `projects-home` `.signals` |
| Cockpit strip: "N tasks across M projects waiting on you" + per-project chips, **sorted needsYou desc**, route on click | `projects-home` `.cockpit` + `store.waiting()` |
| Card pulse: `{open}` + `{needsYou}` chip (absent-not-zero), governance badge, stack chips | `project-card` `.pulse` |
| Card footer: status dot (`connected`/`analyzing`/`error`/`offline`/`needs-auth`) + `· updated {relative}` | `project-card` `.card__foot` |
| Live-dot precedent: shell header connection dot with a soft ring (`box-shadow: 0 0 0 .2rem color-mix(...)`) | `project-shell` `.shell-head__dot` |
| Per-project SSE: `/api/events?project=<id>` pushes the full read-model on any change | `events.service.ts` |
| Reduced-motion discipline: motion tokens zeroed at `prefers-reduced-motion`, disable-at-same-specificity pattern | both components |

**What is missing (this design's job):**

- **(M1) The list is fetched once.** `ngOnInit → store.load()` then a one-shot `hydrateProfiles()`. Nothing updates the strip or cards after first paint. The per-project SSE channel exists but the home subscribes to **none** of them.
- **(M2) No state-freshness signal.** `record.lastSeen` is a registry **touch-time** (when the hub last polled/saw the folder), not when the project's *state* last changed. A project whose ledger just moved does not currently "feel live"; a project untouched for an hour but with a registry ping looks identical to one that just pushed.
- **(M3) The needs-you counts don't re-animate** when a project pushes an update, and there is no announce policy for live count changes (today `aria-live` sits on a value that never changes after load).

---

## 2. Scope skepticism — the smallest change that delivers

The temptation is a real-time aggregate backend with per-ticket diffing on the home. **Reject that.** The home is a *launcher*, not a workspace. The smallest change that makes it feel live and answers "which project needs me, is this fresh":

**Build:**
- **A1 — List-level live channel.** Subscribe the home to a hub stream that re-emits the **list rollup** (the same `{ id, status, lastSeen, taskSummary }` records the list endpoint returns, plus a `stateChangedAt`) whenever *any* connected project's state changes. The store adopts the pushed record set; existing computeds (`totalNeedsYou`, `waiting`, `projectCount`) recompute for free because they're signals. This is the entire mechanism — no per-card subscriptions, no N fan-out.
- **A2 — Freshness derived per card** from a new `stateChangedAt` timestamp + the live channel's connectedness, expressed as a 4-state vocabulary (§4).
- **A3 — A live dot on the card** (reusing the shell's dot+ring precedent) and a freshness word in the footer.
- **A4 — A debounced, net-change-only announce policy** for the global total (§6).
- **A5 — Count re-flow without layout shift or card re-sort** (§7).

**Backend seam (note for /arch + /be, not this doc's deliverable):** the cockpit needs *either* an unscoped `/api/events` that carries a list-rollup frame, *or* a lightweight `/api/events/projects` aggregate. The card needs **one new field** on the list record: `stateChangedAt` (ISO, the ledger/KB last-mutation time — distinct from registry `lastSeen`). Without `stateChangedAt`, freshness degrades gracefully to "live vs offline" only (see §4 degradation). This is a wire addition, not a new model.

**Do NOT build** — see §8.

---

## 3. Information hierarchy (top → bottom)

The home already has the right spine. We **reorder the emphasis** so the rollup is unmistakably the headline, and thread liveness in as the *quietest* layer:

```
┌─ topbar: DART · Studio ─────────────────────────────────── (live: brand dot) ┐
├──────────────────────────────────────────────────────────────────────────────┤
│  Your projects                                  3 projects · ◉ 5 need you      │  ← head + signals (live count)
│  Pick up where a project needs you.                                            │
│                                                                                │
│  ╔══ NEEDS YOU ════════════════════════════════════════════════════════════╗  │  ← THE ROLLUP BAND (headline)
│  ║ ◉ 5 tasks across 2 projects waiting on you                               ║  │     (was: cockpit strip — promoted)
│  ║   [ acme-api · 3 ]  [ billing-svc · 2 ]                                  ║  │     chips sorted needsYou desc
│  ╚══════════════════════════════════════════════════════════════════════════╝  │
│                                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │  ← grid (live per-card)
│  │ project card │ │ project card │ │ project card │ │  + Add a     │          │
│  │  (freshness) │ │  (freshness) │ │  (freshness) │ │   project    │          │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘          │
└──────────────────────────────────────────────────────────────────────────────┘
```

The rollup band **is the existing `.cockpit` strip** — promoted, not replaced. Decision in §5.

---

## 4. Freshness state vocabulary (per project)

Four states. **Each carries shape + word + colour — never colour alone** (house rule; matches the glyph/text discipline already in the codebase). The freshness signal lives in the **card footer**, beside the existing status dot — it is the *calmest* row by design.

| State | When | Word | Shape | Colour token | Motion |
|---|---|---|---|---|---|
| **live** | state pushed within the **active window** (≤ ~20s) AND the live channel is open | `live` | filled dot **with soft ring** (reuse shell `box-shadow: 0 0 0 .2rem color-mix(success 22%)`) | `--kb-success` | one **single** ring pulse on the push, then static (§7) |
| **idle** | channel open, watched, last state change older than active window but fresher than the stale threshold | `updated 4m ago` | filled dot, **no ring** | `--kb-text-muted` | none |
| **stale** | last state change older than the **stale threshold** (e.g. ~10m) — data on screen may lag reality | `stale · 14m ago` | **hollow / dashed** dot (the `pending` glyph already exists: dashed circle) | `--kb-warning` | none |
| **offline / error** | registry status is `offline`/`error`/`needs-auth`, OR the live channel dropped and cannot reconnect | `offline` / `unreadable` | dot with a slash (the `blocked` glyph exists) | `--kb-danger` (error) / `--kb-text-subtle` (offline) | none |

**Distinctions that matter:**
- **live ≠ idle:** "live" means *just pushed or actively streaming*; the ring is the only difference, and the ring appears only briefly on a push (then it's idle-with-recent-time). We are NOT painting a permanently glowing dashboard.
- **stale is about state-age, not connection.** A connected project nobody has touched in 20 minutes is `stale` — that is the signal that fixes M2. It says "this number might be old," which is the trust the enterprise case needs.
- **offline/error** reuse the *status* the registry already assigns; freshness defers to status when status is bad. We do not invent a parallel error vocabulary.

**Threshold tokens (design intent, /fe owns the constants):** active ≈ 20s, stale ≈ 10m. Coarse on purpose — the relative string is already coarse (`formatRelative`). Freshness must re-derive on a **single shared ticker** (one `setInterval`, ~30s, owned by the home) so "4m ago" ages without a push and without N timers. Reduced-motion does not affect the ticker (it's text, not animation).

**Degradation (no `stateChangedAt` from backend):** collapse to two states — **live** (channel open) and **offline** (channel down). No `idle`/`stale` word, footer shows the existing registry `· updated {lastSeen}`. The card must never *fabricate* freshness it can't prove — absent-not-zero applies to freshness too.

### 4.1 Card mockups — each freshness state

`live` (a ticket just moved in this project — ring shown for the push moment):
```
┌────────────────────────────────────┐
│ ▣  acme-api          🛡 Security-rev │
│                                     │
│ Acme public API                     │
│ Payments + identity edge service.   │
│                                     │
│ ✓ 12 open   ◉ 3 need you            │   ← pulse (needsYou warning hue)
│ [java] [spring] [postgres]          │
│ ─────────────────────────────────  │
│ ◉⟩ connected   ·  live              │   ← footer: status dot + freshness (ring on dot)
└────────────────────────────────────┘
```

`idle` (watched, nothing changed recently):
```
┌────────────────────────────────────┐
│ ▣  billing-svc                      │
│                                     │
│ Billing service                     │
│ VAT + invoicing.                    │
│                                     │
│ ✓ 8 open   ◉ 2 need you             │
│ [kotlin] [postgres]                 │
│ ─────────────────────────────────  │
│ ● connected   ·  updated 4m ago     │   ← solid dot, no ring; aged text
└────────────────────────────────────┘
```

`stale` (data on screen may lag — state-age past threshold):
```
┌────────────────────────────────────┐
│ ▣  legacy-portal                    │
│                                     │
│ Legacy portal                       │
│ Internal admin tools.               │
│                                     │
│ ✓ 3 open                            │   ← no needsYou chip (absent-not-zero)
│ [php]                               │
│ ─────────────────────────────────  │
│ ◌ connected   ·  stale · 14m ago    │   ← hollow/dashed dot, warning word
└────────────────────────────────────┘
```

`offline / error` (path gone or unreadable — status defers freshness):
```
┌────────────────────────────────────┐
│ ▣  archived-thing                   │
│                                     │
│ Archived thing                      │
│ No description collected yet.       │
│                                     │
│ (no pulse — state unreadable)       │   ← summary absent, not zeroed
│ ─────────────────────────────────  │
│ ⊘ offline   ·  unreadable           │   ← slashed dot, danger/subtle word
└────────────────────────────────────┘
```

**Footer grammar:** `{status dot+word}  ·  {freshness word/age}`. The status word and freshness are two facts on one demoted line — same line that already reads `connected · updated 2h ago`. We are **reinterpreting** that line, not adding a row. No new vertical space on the card.

---

## 5. The "needs you across projects" rollup band

**Decision: promote the existing `.cockpit` strip into the headline band — keep the chips, don't replace them.** The chip strip is already the right interaction (sorted-by-urgency click-targets that route). It is *under-emphasised*, not wrong.

Changes (all CSS/markup-light, no new component):

1. **Label it.** Add a small `NEEDS YOU` eyebrow/heading so the band reads as *the* triage surface, not an incidental banner. The lead line stays: "N tasks across M projects waiting on you."
2. **Order is the product.** Chips are already `sort((a,b) => b.needsYou - a.needsYou)`. The **first chip is the answer to "which project needs me first."** Keep that ordering; do not let live pushes reshuffle it disorientingly (§7 — reorder only on settle, with motion gated).
3. **Absent-not-zero stays.** Band is entirely absent when `totalNeedsYou === 0`. No "all clear" banner that takes space — silence is the all-clear (the head signals already drop the "need you" pill at 0).
4. **One subtle freshness cue on the band lead**, NOT per chip: a single live dot on the lead glyph row that shows the **rollup channel is connected**. If the channel drops, the lead shows a quiet `· reconnecting…` so the developer knows the count may be frozen. This is the *only* place we surface channel health at the rollup level — per-chip liveness would be noise.

### 5.1 Rollup band mockup

```
╔═ NEEDS YOU ═══════════════════════════════════════════════════════════════╗
║                                                                           ║
║  ◉ 5 tasks across 2 projects waiting on you                     · live    ║   ← lead + channel health (right)
║                                                                           ║
║   [ acme-api · 3 ]   [ billing-svc · 2 ]                                  ║   ← chips, needsYou desc, route on click
║     ↑ first = act here first                                              ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

Channel dropped:
```
╔═ NEEDS YOU ═══════════════════════════════════════════════════════════════╗
║  ◉ 5 tasks across 2 projects waiting on you             · reconnecting…   ║   ← count may be frozen; honestly said
║   [ acme-api · 3 ]   [ billing-svc · 2 ]                                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

The band keeps the existing `border-left: 3px solid var(--kb-warning)` — warning hue, never an alarming red fill. The eyebrow uses `--kb-warning` text. Chips unchanged (`--kb-surface-muted` pills, focus-visible ring already present).

---

## 6. Live-announce a11y policy (the critical part)

Live counts updating on screen must **inform** a screen-reader user, never **spam** them. Eight projects pushing during a build cannot fire eight announcements.

**Policy:**

1. **Politeness = `aria-live="polite"` only.** Never `assertive`. A waiting-task count is never an interrupt-worthy alert. (The `.signals` strip already has `polite`; keep it. The `.cockpit__lead` has `role="status"` which is implicitly polite — keep it, but it must not announce on every push, see below.)

2. **Announce the TOTAL only, and only on NET CHANGE.** There is exactly **one** live region that announces: the global total ("N need you"). Per-card freshness changes, per-chip count changes, and re-flows do **not** announce. The screen-reader hears the headline number change, nothing else.

3. **Debounce.** Coalesce pushes within a window (~1.5–2s) and announce once, with the **settled** value. A burst of 6 pushes during a build → one announcement of the final total, not six. Implementation: the announced string is written to the live region only after the debounce timer fires, and only if the value differs from the last announced value.

4. **Announce the delta in words, not just the number.** The live region should read a self-contained sentence so it makes sense out of context, e.g. *"Now 5 tasks need you across 2 projects"* (up) or *"3 tasks need you"* (down). Avoid reading raw `5` with no frame. Keep it short.

5. **Suppress the no-op and the first paint.** If the debounced value equals the last announced value, say nothing. The initial load value is rendered but **not** announced (it's the page state the user is landing on, conveyed by normal reading — announcing it would talk over page entry).

6. **Freshness words are NOT a live region.** `live`/`idle`/`stale`/`offline` per card are visible-only state; they change as the ticker ages text and as pushes arrive, and announcing them would be a firehose. A screen-reader user reaches a card, hears its status + freshness as ordinary content when they navigate to it. The card's `aria-label` already names the project; the footer text is readable on focus.

**Live-region structure (intent):**
```
<p class="sr-rollup" aria-live="polite" aria-atomic="true">
  <!-- written ONLY by the debounced announcer; e.g.: -->
  Now 5 tasks need you across 2 projects.
</p>
```
A single visually-hidden (`sr-only`) region dedicated to announcements, `aria-atomic="true"` so the whole sentence is read as one unit. The *visible* counts (`.signals`, band lead) update independently and do not themselves need to be live regions once this dedicated announcer exists — keeping `polite` on the visible strip is harmless but the dedicated region is the contract. Pick one announcing region to avoid double-speak; the dedicated `sr-rollup` is preferred and the visible strip's `aria-live` should then be removed to prevent two regions announcing the same change.

---

## 7. Reduced-motion & don't-distract

A developer with 8 projects open must not get a flashing dashboard. Restraint rules:

1. **No layout shift on count change.** A digit changing `3 → 5` must not reflow neighbours. Counts sit in their existing inline-flex pills; a width change of one glyph is fine, but **do not** insert/remove the "need you" pill on every push if it causes the head to jump — it only appears/disappears at the 0↔non-0 boundary, which is rare. Reserve no extra space, but the pill's presence is governed by the same absent-at-0 rule already shipped.

2. **The live dot pulses ONCE per push, then rests.** On a push to a project, its card's live dot plays a **single** ring-expand (≤ ~400ms, the shell ring as the rest state) — not a continuous heartbeat. A continuously pulsing dot across many cards is exactly the "flashing dashboard" to avoid. After the single pulse the dot is a static filled dot with the soft ring; once the active window lapses it drops to the `idle` solid dot.

3. **`prefers-reduced-motion` gates ALL of it.** Reuse the established token pattern: motion tokens zeroed under reduced-motion; the ring-pulse keyframe disabled **at the enabling rule's specificity** (the codebase's documented cascade trick). Under reduced motion: the dot still *changes state* (live→idle→stale) — that's information — but it **swaps instantly with no animation**. The freshness *word* is the reduced-motion fallback for the dot; it always carries the meaning.

4. **Stable card order — cards NEVER re-sort live.** Card grid order is fixed for the session (connect prepends; otherwise list order is stable). A live push **updates a card in place** (its pulse/freshness), it does **not** move the card. Cards jumping around as counts change is disorienting and breaks the user's spatial memory of "billing is the third card." The rollup *band* chips carry the urgency ordering; the *grid* stays put.

5. **Rollup chips re-sort only on settle, calmly.** The band's chips are sorted by urgency, so they *can* legitimately reorder when counts change. Rule: reorder only after the debounce settle (§6), and when motion is allowed use a brief crossfade/position ease (reuse `--kb-ease-out`, ≤ ~200ms); under reduced motion they snap. Never animate a chip reorder on every individual push. If reordering proves distracting in QA, fall back to **sort-on-load-only** and let counts update in place — ordering correctness matters less than calm, and the chips are few.

6. **The grid stagger-enter stays a load-only effect.** The existing `card-enter` stagger must NOT replay on live updates — it's an entrance animation, not an update animation. Live updates touch only the card's internal pulse/footer.

---

## 8. Do NOT build (anti-gold-plating)

- ❌ **Per-ticket live detail on the home.** No live ticket lists, no per-ticket status streaming on a card. The home shows *rollups*; the per-project shell is where tickets live. Hard line.
- ❌ **Auto-refresh spinners / "refreshing…" overlays.** Liveness is push-driven and silent. No spinner chrome, no skeleton flashes on a push. (Spinner glyph exists for in-flight *actions*, not for ambient freshness.)
- ❌ **Notification sounds, toasts, badges, title-bar count, OS notifications.** Out of scope and distracting.
- ❌ **Re-sorting the card grid on every push.** §7.4. Spatial stability wins.
- ❌ **A continuously pulsing/heartbeating live dot.** §7.2. One pulse per push, then rest.
- ❌ **A new aggregate dashboard page / "mission control" route.** Extend the existing home. A separate page splits attention and duplicates state.
- ❌ **Assertive announcements or per-card/per-chip announcements.** §6. One debounced, polite, total-only announcer.
- ❌ **Inventing a freshness signal the backend can't prove.** If `stateChangedAt` is absent, degrade to live/offline — never fabricate "stale" from registry `lastSeen` (it's a touch-time, the very confusion we're fixing).
- ❌ **Per-card SSE subscriptions (N connections).** One list-level channel. §2/A1.
- ❌ **A "mark all seen" / dismiss / snooze affordance.** This is a *live mirror*, not an inbox. Clearing is what doing the work does.

---

## 9. Acceptance criteria (behavioural — for /fe)

**Live rollup**
1. When any connected project's state changes, the home's **"need you" total**, the **band lead** ("N tasks across M projects"), and the relevant **card's pulse** update **without a manual reload**, within one push cycle.
2. The band chips remain ordered by descending `needsYou`; the first chip is the highest-urgency project. Clicking any chip routes to that project (existing behaviour, unchanged).
3. When `totalNeedsYou` is 0, the band and the "need you" pill are **absent** (not shown as zero).
4. Connecting a new project adds its card to the grid and folds its counts into the rollup live, without re-fetching the whole list.

**Freshness**
5. Each card shows exactly one freshness state — **live / idle / stale / offline-or-error** — chosen per §4, carrying **shape + word + colour** (never colour alone). The freshness word is always present when a freshness state is shown.
6. A project whose state changed within the active window reads **live** (dot + ring + word). After the window lapses it reads **idle** with an aged relative time. Past the stale threshold it reads **stale** (dashed dot, warning word).
7. Freshness ages **without a push**: a single shared ticker re-derives the relative time/state on an interval; no per-card timers.
8. If the backend provides no `stateChangedAt`, cards degrade to **live / offline** only, and never display a fabricated `stale`/`idle` age.
9. Registry status `offline`/`error`/`needs-auth` takes precedence over freshness; the footer shows the offline/error vocabulary, and a project with no `taskSummary` shows **no pulse** (not a zeroed pulse).

**A11y (live-announce)**
10. There is **one** announcing live region (`polite`, `aria-atomic`), announcing **only the total**, **only on net change**, **debounced** (a burst of pushes yields one announcement of the settled value).
11. The announcement is a self-contained sentence (e.g. "Now 5 tasks need you across 2 projects"); a no-op (unchanged value) and the initial page-load value are **not** announced.
12. Per-card freshness changes, per-chip count changes, and chip re-orders do **NOT** trigger announcements.
13. Nothing uses `aria-live="assertive"`.

**Motion / don't-distract**
14. A count change causes **no layout shift** to neighbouring content.
15. The live dot pulses **once** per push (≤ ~400ms) then rests as a static dot; it does **not** loop.
16. Under `prefers-reduced-motion: reduce`: no ring pulse, no chip-reorder animation, no stagger replay — state still changes, but **instantly**; the freshness **word** always conveys the meaning.
17. **Cards never re-sort live.** A push updates a card in place; the card does not change grid position within the session.
18. The grid entrance stagger runs on load only and does **not** replay on live updates.

**Security (carried, unchanged)**
19. All project-derived text (title, description, label) continues to render via Angular interpolation only — never `[innerHTML]`. No freshness/rollup feature introduces an HTML-bypass sink. The no-tofu rule holds: any new glyph is an inline SVG from the existing `GlyphComponent` set (e.g. `pending` for the dashed/stale dot, `blocked` for offline) — no icon font, no exotic Unicode.

---

## 10. Token & glyph notes for /fe

- **Colours:** `--kb-success` (live ring), `--kb-text-muted` (idle), `--kb-warning` (stale + band hue), `--kb-danger` (error), `--kb-text-subtle` (offline). All already defined in both dark and light `_tokens.scss`.
- **Live ring:** reuse the shell precedent verbatim — `box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--kb-success) 22%, transparent)`.
- **Dashed/stale dot:** the `pending` glyph (dashed circle) already exists; or a bordered hollow dot via `background: transparent; border: 1.5px solid var(--kb-warning)`.
- **Offline slash:** the `blocked` glyph exists. Keep the footer dot+word; the word carries meaning so the glyph is decorative.
- **Motion tokens:** follow the in-file pattern — declare `--kb-dur-*` on `:host`, zero them in `@media (prefers-reduced-motion: reduce)`, and disable keyframes at the enabling selector's specificity (documented in both components).
- **One ticker:** a single `setInterval` (~30s) on the home re-evaluates freshness; do not spawn per-card timers.

---

## 11. Handoff

- **/arch + /be:** confirm the list-level live frame (unscoped `/api/events` rollup vs. a new `/api/events/projects`) and add `stateChangedAt` (ledger/KB last-mutation ISO) to the list record. Without it, freshness degrades per §4/AC8 — acceptable but lesser.
- **/fe (Finn):** implement against §9 ACs; extend `ProjectsHomeComponent` (subscribe + debounced announcer + shared ticker) and `ProjectCardComponent` (freshness footer + single-pulse dot). No new page, no new card component.
- **/rev:** verify no `[innerHTML]`, no per-card SSE fan-out, one polite announcer, cards don't re-sort live.
- **/qa + /e2e:** test the announce-debounce (burst → one announcement), reduced-motion (no pulse/reorder), stable card order under live pushes, and the live/idle/stale/offline transitions including the no-`stateChangedAt` degradation.
```

This is a design doc only. No code, tests, or implementation produced.
