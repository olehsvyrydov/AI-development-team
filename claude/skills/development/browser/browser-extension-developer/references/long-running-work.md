# Long-running work in a browser extension

Load for: any job that takes more than a few seconds — a crawl, a bulk upload, a sync — and the UX
of reporting it.

## Contents

- [Who owns the job](#who-owns-the-job)
- [Model the job as state, not as DOM](#model-the-job-as-state-not-as-dom)
- [Phases: report at two altitudes](#phases-report-at-two-altitudes)
- [Pacing and rate limits](#pacing-and-rate-limits)
- [Cancellation that actually cancels](#cancellation-that-actually-cancels)
- [Honest progress](#honest-progress)
- [Rendering a long list without jank](#rendering-a-long-list-without-jank)
- [Resume, and why usually not](#resume-and-why-usually-not)

## Who owns the job

**An extension page in its own tab.** Not the worker (evicted), not the popup (closes on blur), not
the side panel unless per-window state is genuinely what you want.

The shape that works:

```
popup            → writes a job record, opens the run page, closes
run page (a tab) → owns the job for its whole life; has full DOM and every extension API
worker           → reaps what the run page orphans if it disappears without warning
```

Hand the job over as a **record in `chrome.storage.session` keyed by an id**, with the id in the run
page's URL. A query string of parameters is a contract nobody can check, it puts identifiers into
history and the omnibox, and every new field needs both surfaces to agree a new key. Garbage-collect
records nothing claimed, so an abandoned job cannot accumulate.

Warn before a reload throws the job away:

```js
window.addEventListener('beforeunload', (e) => { if (running) e.preventDefault(); });
```

Chrome only shows the dialog once the page has had a real interaction, so this is a cheap guard and
nothing may be built on it. Say so in the comment.

## Model the job as state, not as DOM

The instinct is a few module-level variables and some `textContent` assignments. It does not survive
contact with the second requirement: nothing can read the job's state, so nothing can render it twice,
test it, or report it at two altitudes at once.

Model it as one value, advanced by a reducer:

```ts
type ItemPhase = 'pending' | 'navigate' | 'render' | 'extract' | 'push' | 'waiting'
               | 'done' | 'failed';

interface RunState {
  phase: 'enumerating' | 'working' | 'done' | 'cancelled' | 'failed';
  items: readonly ItemState[];
  cursor: number | null;
  counts: Counts;          // folded in as each item finishes, not tallied at the end
  startedAt: number; endedAt: number | null;
}
```

What this buys, all of it hard to get any other way:

- **Live counts.** Folding each outcome in as it happens deletes the end-of-run tally loop and lets
  the summary be correct at every moment, not only the last one.
- **Testable invariants.** "Items the user cancelled stay `pending`, never `failed`" and "a terminal
  state absorbs late events" are one-line tests against a pure reducer, and are otherwise prose
  comments nothing enforces.
- **Two renderers.** The page and (say) a tab-group title are both just functions of the state.
- **A pure formatting layer.** Every user-facing string becomes a function of state, which is where
  the honesty questions live (below) and where they can be reviewed.

Keep the driver itself free of `chrome.*` by taking its browser dependencies as an injected object.
It is then testable without a `chrome` stub, which is the whole ballgame for a job driver.

## Phases: report at two altitudes

A job of N items has two questions running at once, and answering only the first is what makes a
progress bar useless:

1. **Where is the job?** item 12 of 48, this fast, about this long left.
2. **Where is the item?** navigating, rendering, extracting, pushing — and how much of *this item's*
   budget it has spent.

The second is what distinguishes a slow job from a hung one. A bar that moves once every eight
seconds and says nothing in between is indistinguishable from a crash.

Get sub-phase progress out of the work function by passing a reporter **into** it. The work function
is a closure the driver writes, so it already holds the state store; it calls the reporter itself and
passes it down into each step. No event bus, no plumbing through the queue.

```ts
type ReportPhase = (r: { phase: ItemPhase; detail?: string; ratio?: number }) => void;

async function collectOne(item, tabId, report: ReportPhase) {
  report({ phase: 'navigate', detail: item.url });
  await renderInTab(tabId, item.url, report);   // reports 'render' each poll, with the growing size
  report({ phase: 'extract' });
  return push(await extract(tabId, report));
}
```

**The one thing a work function cannot see is that the queue is deliberately idle** — the pacing gap
between items, or a server-suggested retry wait. Those are stretches where nothing calls the work
function, so the view looks hung while the job is behaving perfectly. Give the queue one optional
`onWait` callback for exactly that, and report the wait **after** clamping — telling the user "waiting
86400s" while the lane waits 120 is a lie about your own plan.

## Pacing and rate limits

- **Serial by default.** Parallel tabs multiply memory and are usually pointless when the server is
  the constraint.
- **A fixed gap between requests** keeps bursts impossible.
- **Honour `Retry-After`, but clamp it.** It is a hint from whatever proxy answered, not a promise you
  must keep; an intermediary asking for a day would otherwise freeze the job and its progress bar for
  a day.
- **Retry only what can heal.** A 429 can heal; a 403 or a 400 cannot, and retrying it three times
  just delays the failure report.
- **One failed item costs that item.** A 200-item job that dies at item 37 is far worse than one that
  finishes with a failure list. Isolate per-item failures, record them with a human-readable reason,
  and continue.

## Cancellation that actually cancels

A cancel flag polled only between items leaves Cancel inert for however long one item takes — and if
enumeration is a three-minute read, inert for three minutes. Poll it in **four** places:

1. Before each item starts.
2. After the pacing wait (so a cancel during it does not spend one more item).
3. **Through** a retry wait, in slices — a two-minute sleep in one call is two minutes in which
   Cancel does nothing.
4. **Inside the enumeration**, which is usually the longest phase and the one with nothing to show.

And be honest about the result: items the job never reached produce **no outcome**. They are "not
collected", not "failed". A cancelled job that reports 180 failures is lying about its own state.

## Honest progress

This is where most progress UI loses the user's trust, and every case is a wording decision:

- **Never invent a denominator.** Before enumeration finishes there is no total; show an
  indeterminate state, not a bar creeping to a made-up number.
- **Elapsed-against-timeout is not completion.** A render poll's `elapsed / timeout` is *how much of
  this item's budget is spent*, not how done it is. Label it "8.2s of 25s budget" and never as a
  percentage — a percentage reads as completion, and this one can sit at 90% and then succeed
  instantly.
- **No ETA until you have evidence.** Null until at least one item has finished.
- **Estimate from the median, not the mean.** Item durations are wildly skewed: one page that burns a
  25-second timeout among nine three-second pages trebles a mean-based estimate, and the countdown
  jumps backwards in front of the user.
- **A partial result is still a result.** An item stored without its images is stored; count it as
  such *and* flag it separately. Silence there is what makes content loss invisible.
- **Distinguish outcomes that are not failures.** "unchanged" and "empty" are successes that cost
  nothing; painting them as skips invites the user to go looking for what went wrong.

## Rendering a long list without jank

- **Reuse rows.** Keep `Map<id, HTMLElement>` and touch only what changed. Rebuilding a 500-row list
  several times a second is a real, visible stall.
- **Render a window.** Around 40 rows near the cursor, plus every failure outside it — a failure that
  scrolls away is the one thing the user came back to find. Say how many are hidden.
- **`aria-live` on the summary lines only.** The item list must be `aria-live="off"`: a list that
  announces several times a second makes the page unusable with a screen reader.
- **Tick the clock separately.** Elapsed time and the ETA age between events; a page whose only moving
  part updates once a minute reads as stalled. A one-second interval that re-renders from state is
  enough.

## Resume, and why usually not

Persisting the state so a reloaded page can re-attach is tempting and usually wrong: the job **is**
the page's JavaScript. Reload it and the driver is gone, the working tab has been closed by your own
`pagehide` handler, and a re-attached view renders a frozen snapshot with a bar that will never move —
strictly worse than an honest "this job ended when the tab reloaded".

Build resume only if you also build a driver that can restart mid-list, and only if jobs are long
enough to justify it. Otherwise: guard the reload, say plainly that the tab is the job, and make
starting again cheap.
