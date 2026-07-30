# Tabs, groups and windows

Load for: opening or driving tabs, organising a multi-tab job into a tab group, or cleaning up after
one.

## Contents

- [Working tabs](#working-tabs)
- [Never steal focus](#never-steal-focus)
- [Tab groups](#tab-groups)
- [Group titles as a progress readout](#group-titles-as-a-progress-readout)
- [When the user rearranges your work](#when-the-user-rearranges-your-work)
- [Reaping what you opened](#reaping-what-you-opened)

## Working tabs

A job that must render pages needs a tab to render them in. Rules that make it bearable:

- **One tab, reused.** `chrome.tabs.update(tabId, { url })` per item, not a tab per item. A tab per
  item exhausts memory and floods the strip.
- **Created inactive**, always: `chrome.tabs.create({ active: false, url: 'about:blank' })`.
- **`activeTab` does not cover it.** The user invoked the extension on *their* tab; a tab you opened
  is not that tab. Without a granted host permission for the origin, every injection into it fails —
  and it fails the same way an empty page does, so the symptom is "collected nothing" rather than
  "permission denied". Gate for the permission before the job starts.
- **Give it a position.** `{ windowId, index }` puts it where you want; without them it lands at the
  end of the strip, and a subsequent grouping will visibly rearrange things.

## Never steal focus

An extension that makes a background tab active takes the browser away from the user mid-task. There
is no acceptable reason to do it during a job. Watch for it in two places: `chrome.tabs.create`
defaults `active` to **true**, and `chrome.windows.create` focuses by default.

Pages you drive can also steal focus themselves (`window.focus()`, autoplay prompts). You cannot
prevent it entirely; verify against real sites, and never add to the problem yourself.

## Tab groups

`chrome.tabGroups` (permission: `tabGroups`; grouping itself is `chrome.tabs.group`, which needs
`tabs`) turns a multi-tab job into **one visible object** — named, coloured, collapsible, with a
title that can carry live state.

```js
const groupId = await chrome.tabs.group({ tabIds: [runTabId, workTabId] });
await chrome.tabGroups.update(groupId, { title: 'Job · 12/48', color: 'cyan', collapsed: false });
await chrome.tabs.group({ tabIds: [anotherTabId], groupId });   // add later
```

Facts that shape the design:

- **A pinned tab cannot be a group member.** They are mutually exclusive. If you were pinning a
  long-lived job tab, the group is the better anchor — it is named, it carries state, it collapses,
  and it can hold the other tabs, which pinning never could.
- **Groups must be contiguous, and `chrome.tabs.group` MOVES tabs** to make them so. Create the tabs
  you intend to group adjacent to each other, or the user watches their strip rearrange.
- **Colours are a fixed enum:** `grey blue red yellow green pink purple cyan orange`. Pick a
  vocabulary and keep it: one colour for working, one for finished-clean, one for finished-with-
  problems, one for stopped.
- **`TAB_GROUP_ID_NONE`** identifies an ungrouped tab. Check it before adding someone's tab to your
  group — never yank a tab out of a group the user built.

Guard adding a tab you did not create on all three of: same window, not pinned, not already grouped.
Any of them failing just means a smaller group, never a failed job.

## Group titles as a progress readout

The title is a **glance surface, not a progress bar** — the real one is on your page. Treat it
accordingly:

- **Debounce to at most one write every ~2 seconds.** This is correctness, not politeness. Tab-strip
  mutations are **refused while the user is dragging any tab** ("Tabs cannot be edited right now"), so
  a write per item on a long job is a guaranteed stream of rejections; every write also relays the
  strip and fires `onUpdated` to every listener in the browser. And a job's real cadence is seconds
  per item, so a two-second-stale count is indistinguishable from a live one.
- **Guarantee the last value lands.** A trailing write is what stops a job ending with a stale count
  because its final tick fell inside the quiet window.
- **Drop identical titles** without a write.
- **Catch every write**, and stop the ticker after a few consecutive failures — the group is gone, or
  Chrome will not take writes, and asking forever is noise.
- **Keep it short.** The chip truncates from the right, so the volatile part (the count) belongs where
  it survives. Do not put an unbounded name in it; that belongs in your page's heading.

## When the user rearranges your work

| The user | You |
|---|---|
| Ungroups the group | `chrome.tabGroups.onRemoved` → stop writing to it. **Never re-create it** — that is fighting them. The job continues. |
| Drags a tab out | Nothing. The tab id is unchanged and everything still works; only the visual grouping is lost. Never re-group. |
| Collapses the group | Nothing. That is the feature. |
| Closes your working tab mid-job | **Notice.** Otherwise every remaining item fails in turn and they get two hundred misleading failures instead of the one true one. Watch `chrome.tabs.onRemoved` for its id and stop the job with an honest reason. |
| Closes the job tab | The job is over. Clean up (below). |

## Reaping what you opened

A background tab has no UI, so nothing else will ever close it. Cover three paths:

1. **The ordinary exit** — close it when the job ends, in a `finally`, so a throw does not skip it.
2. **The page going away** — a `pagehide` listener on the owning page closes it as that page unloads.
3. **The page going away without warning** — `pagehide` is not guaranteed. Tell the service worker
   the pairing (owner tab id → working tab id) in `chrome.storage.session`, and have a **top-level**
   `chrome.tabs.onRemoved` listener in the worker reap the working tab when its owner disappears.

Clear the pairing when the job ends normally, or a later tab reusing the id inherits it.

Chrome removes an emptied group by itself, so there is usually no explicit ungroup to do — but settle
the group's final title and colour **before** closing the last working tab, or the group can vanish
before its terminal state was ever seen.
