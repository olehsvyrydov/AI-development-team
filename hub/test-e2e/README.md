# Hub API end-to-end tests (dev-only)

Black-box HTTP end-to-end tests for the multi-project registry + connect/analyze
API. They start the **real** shipped entrypoint `hub/server.js` as a child process
on an ephemeral loopback port and drive `/api/projects` over HTTP.

Zero new dependencies — Node's built-in `node:test` + `node:http` only. Nothing
here is part of the shipped, zero-dependency hub runtime; run it from a checkout.

## Run

```bash
node --test hub/test-e2e/
```

(Requires Node 18+ for `node:test`; developed against Node 24.)

## Isolation

- Each server is spawned with `HOME` pointed at a throwaway temp dir, so the
  user-global registry `~/.aidevteam/registry.json` is never read or written.
- Each test creates its own temp project fixture (README.md + package.json + a
  marker file) and removes it on teardown. Ports are OS-assigned.

## Coverage

- **Lifecycle** — connect → list → get → delete, with on-disk side-effect checks
  (registry written under the isolated HOME; the project's marker file survives delete).
- **Idempotent connect** — same folder twice → one entry, stable id.
- **Security** — write guard (`X-AIDT`) on POST/DELETE; path-traversal and non-hex
  `:id` → 404 with no outside-file content; symlink-to-outside containment in analysis.
- **Bad input** — missing/empty/relative/non-existent/NUL path and a file path → 400.
