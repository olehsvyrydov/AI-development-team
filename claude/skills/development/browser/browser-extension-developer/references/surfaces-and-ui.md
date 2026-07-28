# Surfaces and UI

Load for: choosing where a piece of extension UI lives, or building any of the surfaces.

## Contents

- [Popup](#popup)
- [Options page](#options-page)
- [Extension page in its own tab](#extension-page-in-its-own-tab)
- [Side panel](#side-panel)
- [In-page overlay](#in-page-overlay)
- [Badge, icon and notifications](#badge-icon-and-notifications)
- [Styling and theming](#styling-and-theming)
- [Accessibility for a page that updates constantly](#accessibility-for-a-page-that-updates-constantly)

## Popup

`action.default_popup`. Opens on the toolbar click, closes on blur — including when a permission
prompt appears.

- **Size:** it sizes to content, roughly 25–800 px wide and up to 600 px tall. Set a `min-width`
  (around 21 rem reads well) so a short state does not produce a sliver.
- **It is the starting gun, not the race.** Anything that takes seconds must be started here and run
  elsewhere. A collect that ran in a popup died whenever the user clicked away — and a popup closes
  for reasons that have nothing to do with the task.
- **It has the extension APIs.** It can call `chrome.tabs.create` itself; routing that through the
  worker only adds the cold-worker message race.
- **Remember the last choice.** A picker that resets on every open is re-picked on every open. Persist
  per relevant scope (per workspace, per site) in `storage.local`.

## Options page

`options_page`, or `options_ui` with `open_in_tab`. A real page, so it survives a permission prompt —
which makes it the right home for anything involving `chrome.permissions.request` at setup time.

Give it a **Save & test** rather than a bare Save: settings that are wrong are usually wrong in a way
only a round-trip reveals, and discovering that on first use is worse.

## Extension page in its own tab

`chrome.tabs.create({ url: chrome.runtime.getURL('run/run.html?...') })`. No `web_accessible_resources`
needed — that is only for resources a *web page* loads.

This is the surface for **owning a long job**: full DOM, every extension API, and a lifetime the user
controls. Two things to get right:

- **Hand parameters over as a record in `chrome.storage.session`, keyed by an id in the URL.** Not a
  query string of parameters — that lands in history and the omnibox, and it is a contract nothing
  checks.
- **Anchor it visibly.** Pinning is one option; a **tab group** is better (named, coloured,
  collapsible, and it can hold the other tabs the job uses). They are mutually exclusive — a pinned
  tab cannot be grouped.

## Side panel

`chrome.sidePanel` (Chrome 114+, permission `sidePanel`). Persists across tab switches within a
window.

- **Per-window, not global.** Two windows means two panels, and closing a window takes its state.
- **Narrow** (~320–500 px). Design for one column; anything wide needs somewhere else to go.
- Use it for a companion to whatever tab is active. Do not use it as the owner of a job whose state
  must survive a window closing.

## In-page overlay

Injected UI, living in the page. The right surface when the user's next action must happen **in the
page** — picking an element, confirming a selection, a toast about what just happened there.

Opening another surface for these is actively wrong: it pulls focus away from the exact tab the user
has to interact with.

Build it defensively — see `injection-and-extraction.md`. Never `alert`/`confirm`/`prompt`: a modal
blocks the page's event loop and with it every subsequent extension command to that tab.

## Badge, icon and notifications

- `chrome.action.setBadgeText` is a glance surface: a count, a dot, nothing more. Four characters is
  the practical limit.
- `chrome.notifications` needs its own permission and is an interruption. Reserve it for something
  that finished while the user was elsewhere and that they asked to be told about.
- A **tab group title** is often the better ambient readout for a job: it is bigger than a badge,
  scoped to the work, and disappears with it.

## Styling and theming

- **Ship a token file** and consume it from every page. Three unrelated stylesheets is how an
  extension ends up with two different accent colours, and the drift is invisible until someone
  screenshots both.
- **If the extension accompanies a product, use the product's tokens** — copied verbatim, so a value
  that changes there can be diffed here.
- **Theme via `prefers-color-scheme`.** An extension surface has no theme toggle of its own; follow
  the OS. (If the product themes on a `data-theme` attribute, note the deliberate divergence in a
  comment — same tokens, different switch.)
- `color-scheme: light dark` on `:root` so form controls and scrollbars follow too.
- Bundle fonts or fall through to `system-ui`. No CDN — CSP forbids remote resources.

## Accessibility for a page that updates constantly

A job page is an unusual accessibility case: it changes several times a second, potentially for
hundreds of rows.

- **`aria-live` on the one or two summary lines only.** The item list must be `aria-live="off"`. A
  list that announces every change makes the page unusable with a screen reader, and the announcement
  the user actually wants is "12 of 48", not each row.
- **`role="progressbar"`** with `aria-valuenow`/`min`/`max` and an `aria-valuetext` that reads in
  words ("12 of 48 pages").
- **Step indicators** as an ordered list with `aria-current="step"` on the active one.
- **Targets ≥24 px**, a visible 2 px focus ring at ≥3:1 contrast, text at ≥4.5:1.
- **Honour `prefers-reduced-motion`** with one guard that neutralises every transition, pulse and
  shimmer.
- `font-variant-numeric: tabular-nums` wherever digits change in place, or the layout jitters.
