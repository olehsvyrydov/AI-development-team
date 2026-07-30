# MV3 architecture — the service worker, state, and messaging

Load for: anything involving the background service worker, state that must outlive a wake, messages
between surfaces, alarms, or an MV2 → MV3 migration.

## Contents

- [The lifecycle, precisely](#the-lifecycle-precisely)
- [What may live in the worker](#what-may-live-in-the-worker)
- [State: the three storage tiers](#state-the-three-storage-tiers)
- [Messaging, and the races in it](#messaging-and-the-races-in-it)
- [Alarms](#alarms)
- [Offscreen documents](#offscreen-documents)
- [Migrating from MV2](#migrating-from-mv2)

## The lifecycle, precisely

- The worker starts on an event it has a top-level listener for, and is **terminated after ~30
  seconds of inactivity**. An in-flight `await` on a network call counts as activity; a `setTimeout`
  does not reliably.
- Chrome also terminates workers that have run for a long time even while busy. There is no
  documented ceiling you may rely on. Treat any job over a few seconds as unsafe there.
- Every wake re-executes the worker's top-level code. Module-scope variables are re-initialised;
  nothing you assigned survives.
- `chrome.runtime.onInstalled` fires on install and on update — the right place for one-time setup
  (default settings, context menus, alarms), and the wrong place for anything a normal wake needs.

**The consequence that catches everyone:** a listener registered inside another listener exists only
for the current wake. This is broken:

```js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'watch') {
    chrome.tabs.onRemoved.addListener(reap);   // gone when the worker is evicted
  }
});
```

and this is right — the registration is top level, and what it *needs to know* is state:

```js
chrome.tabs.onRemoved.addListener((tabId) => { void reap(tabId); });   // wakes the worker

async function reap(tabId) {
  const watched = (await chrome.storage.session.get(KEY))[KEY] ?? {};
  // …act on the persisted pairing…
}
```

## What may live in the worker

**Yes:**
- Routing an event to a short, self-contained action.
- A single request whose message carried everything needed, so the handler is stateless and immune to
  eviction between the trigger and the call.
- Reaping resources when a tab or window disappears.
- Badge and icon updates.

**No:**
- Anything iterating a work list.
- Anything holding a connection, a queue, or a cursor.
- Anything with a progress bar. If it has one, it has a surface; put the job there.

**The pattern that resolves most cases:** the popup starts a job by opening an extension page, and
*that page* runs it. The page has the full DOM, every extension API, and lives exactly as long as the
user is watching. The worker is left doing what it is good at: waking up, doing one thing, going away.

## State: the three storage tiers

| Area | Survives | Quota | Readable by content scripts | Use for |
|---|---|---|---|---|
| `storage.local` | Browser restart; profile-scoped | ~10 MB (unlimited with `unlimitedStorage`) | No | Settings, credentials, caches |
| `storage.session` | Until the browser closes | ~10 MB | No, by default (`TRUSTED_CONTEXTS`) | Cross-wake worker state, hand-offs between surfaces |
| `storage.sync` | Restart **and** syncs across the user's profiles | ~100 KB total, ~8 KB per item, write-rate limited | No | Small user preferences only |

Notes that matter:
- `storage.local` is **not encrypted at rest**. A stored API key is readable by anyone with the
  profile directory. If you must store one, mitigate at the credential (least privilege, revocable,
  audited) rather than pretending the storage is safe.
- `storage.sync` write limits (per minute and per hour) are real; exceeding them starts failing
  writes. Never put anything that changes often there.
- `storage.session`'s `setAccessLevel` decides whether content scripts can read it. Leave it at
  `TRUSTED_CONTEXTS` unless you have a reason.

## Messaging, and the races in it

**The popup/worker race.** A cold worker takes a moment to wake. A popup that posts a message and
calls `window.close()` in the same breath destroys the port before the waking worker runs its
listener — the message is dropped, nothing happens, and a second click "fixes" it because the worker
is now warm. Two ways out, in order of preference:

1. **Do the work in the popup's own context** when the popup holds the API. The popup can call
   `chrome.tabs.create` itself; the hop through the worker adds a race and nothing else.
2. **Await the send** before closing, and have the worker acknowledge.

```js
const ack = await chrome.runtime.sendMessage({ type: 'arm', tabId });
if (ack?.ok !== true) { report(ack?.error); return; }   // and only now close
window.close();
```

**Acknowledge after the work, not before.** A handler that acks immediately and then does its work
tells the sender something succeeded that may be about to fail — arming an injection on a page Chrome
refuses, for instance. Return `true` from the listener to keep `sendResponse` alive across the await.

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'arm') {
    arm(message.tabId).then(() => sendResponse({ ok: true }),
                            (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;   // keeps the channel open
  }
  return false;
});
```

**Type the protocol.** A discriminated union of message shapes turns a mismatch into a compile error
rather than a silent no-op at runtime. Ad-hoc string types are the most common source of "nothing
happened and nothing was logged".

**Validate anything from a page.** `chrome.runtime.onMessage` receives from your own surfaces *and*
from any content script — which any site can influence. Check every field's presence and type before
it reaches `atob`, `Blob`, `fetch`, or a storage write.

## Alarms

`chrome.alarms` is the only reliable timer across worker evictions — `setTimeout` beyond the idle
window simply does not fire. Minimum period is 30 seconds (1 minute in older Chrome). Alarms survive
browser restarts, so clear them on `onInstalled` if they are not meant to.

Use alarms for genuinely periodic work (a sync, a cleanup). Do **not** use them to keep a worker alive
so a long job can finish there — that is fighting the platform, and Chrome has closed each such
workaround in turn.

## Offscreen documents

`chrome.offscreen` creates a hidden document with DOM APIs the worker lacks: `DOMParser`, canvas,
clipboard, audio, `WebRTC`. Create it with a declared `reason`, use it, close it.

It is **not** a way around eviction — the worker that owns it can still be terminated, and an
offscreen document has its own lifetime rules. Reach for it when you need a DOM API in the
background, not when you need a place to run a long job.

## Migrating from MV2

| MV2 | MV3 |
|---|---|
| Persistent background page | Service worker + state in `storage.session` |
| `chrome.tabs.executeScript` | `chrome.scripting.executeScript` (needs `scripting`) |
| `webRequest` blocking | `declarativeNetRequest` (rules, not callbacks) |
| Remote code / `eval` | Forbidden; bundle everything |
| `browser_action` / `page_action` | `action` |
| Callback APIs | Promises (still callback-compatible) |

The migration is rarely mechanical: anything that relied on the background page holding state or
running long needs its architecture reconsidered, not its API calls renamed.
