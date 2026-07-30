# Architecture Reference — Eclipse Theia Platform

> Loaded by /arch (Jorge) when making architecture decisions for a Theia-based IDE product (e.g. **bumbl-app**): process topology, extension model, where external service clients live, MCP integration, packaging/update, and upgrade strategy.

## Trigger

Use this reference when:
- Deciding where a capability belongs in a Theia product (frontend vs backend vs external daemon vs VS Code plugin)
- Designing frontend↔backend contracts, child-process supervision, or streaming paths
- Setting version/upgrade policy or writing ADRs about the Theia foundation
- Reviewing risks (Electron footprint, DI complexity, upstream API churn)

## Process topology

A Theia application is **two cooperating processes** plus optional plugin hosts:

```
┌─ Frontend (browser page / Electron renderer) ──────────────┐
│ Application shell, widgets (React), Monaco, commands/menus │
│ Talks JSON-RPC over WebSocket to the backend               │
└──────────────▲─────────────────────────────────────────────┘
               │ JSON-RPC proxies (service path per service)
┌─ Backend (Node.js) ────────────────────────────────────────┐
│ Filesystem, terminals, LSP/DAP servers, git, plugin host,  │
│ **all external service clients** (e.g. bumbl-dis client +  │
│ child-process supervisor), secrets                         │
└──────────────▲─────────────────────────────────────────────┘
               │ spawn / HTTP+WS+SSE (loopback) / stdio
   bumbl-dis (Rust daemon) · language servers · VS Code extension host
```

Consequences:
- The frontend must work in a plain browser (the browser target is kept for free) — **no Node APIs in frontend code**, ever. Electron only relaxes distribution, not this boundary.
- One backend can serve multiple frontends (browser target); design backend services to be multi-client-safe (per-connection `client` callbacks via `RpcConnectionHandler`).
- The frontend↔backend contract is a set of JSON-RPC services keyed by service-path strings, with plain-JSON protocol types in `common/`. Backend→frontend push = the client-callback half of the same proxy. Treat these protocols as versioned internal APIs.

## Extension model: two mechanisms, both used

| | **Theia extensions** | **VS Code extensions (plugins)** |
|---|---|---|
| Integration | Compile-time npm packages, InversifyJS DI | Runtime, isolated extension-host process |
| Power | Full — can reshape the workbench, `rebind()` any default | Bounded by the VS Code API |
| Risk | Coupled to Theia internals → upgrade cost | Stable API, but can't touch shell internals |
| Source | Your repo (`extensions/*`) | Open VSX (built-time `theiaPlugins` list or runtime install) |

Architecture rule: **differentiators are Theia extensions; commodities are VS Code plugins.** Bumbl's chat/review/agents/KB/security surfaces are Theia extensions (they need custom widgets, DI rebinds, backend services); language support (rust-analyzer etc.), themes, and generic tooling come from Open VSX. Both coexist in one product — don't rebuild what a plugin already provides, and don't force a differentiator through the constrained VS Code API.

The contribution-point pattern is the extensibility spine: an extension declares `bind(SomeContribution).to(Impl)`; the platform (or your own extension, via `ContributionProvider`) collects all implementations. Define Bumbl-internal contribution points the same way when extensions need to extend each other.

## Where things live (placement decisions)

| Capability | Placement | Why |
|---|---|---|
| bumbl-dis client, spawn/supervision, Bearer token | **Backend** (`src/node`) | Child processes + secret custody; renderer never holds credentials |
| Streaming AI deltas to the UI | Backend consumes DIS SSE, forwards via RPC client callback (or loopback fetch-stream from renderer as a documented exception) | Keeps auth server-side; one streaming implementation |
| Chat/review/KB widgets, commands, theming | Frontend extension modules | DOM/UI concerns |
| Protocol types + service paths | `common/` in each extension | Shared, JSON-only |
| Intelligence, persistence, policy | **bumbl-dis itself** | DIS is the single source of truth; the TS layer stays thin and replaceable — no app-side state |
| Generated TS client types | Generated from the DIS JSON-RPC surface | Rust/TS can't drift |

### Contract shape (normative example)

Every frontend↔backend service follows one shape — path constant, server interface, client-callback interface, all JSON-serializable:

```typescript
// common/dis-protocol.ts
export const disServicePath = '/services/bumbl-dis';
export const DisService = Symbol('DisService');
export interface DisService {
    ping(): Promise<{ pong: boolean }>;
    streamChat(req: ChatRequest): Promise<StreamHandle>;   // deltas arrive via DisClient
    setClient(client: DisClient): void;
}
export interface DisClient {
    onDelta(handle: StreamHandle, delta: ChatDelta): void;
    onDisStatusChanged(status: 'starting' | 'ready' | 'restarting' | 'dead'): void;
}
```

Backend binds it with `RpcConnectionHandler(disServicePath, client => …)`; the frontend gets a proxy via `WebSocketConnectionProvider.createProxy(disServicePath, clientImpl)`. Review checklist for new services: JSON-only types, multi-client safe, push via the client callback (no polling), errors as typed results not thrown strings.

### Child-process supervision & capability handshake

The DIS supervisor is a `BackendApplicationContribution` (`onStart` spawns, `onStop` kills): loopback bind, random port + handshake preferred, Bearer token generated per session and held only in the backend process. On connect it calls `system.capabilities` and exposes the result to the frontend; features gate on advertised capabilities (`streaming`, `conversations_persisted`, `agent_tools`, `multimodal_ingest`) so app and daemon can ship independently and degrade gracefully. Respawn with exponential backoff; after N failures surface a status-bar error state rather than looping forever.

## Theia AI & MCP integration points

- **Theia AI** (`@theia/ai-core`, `@theia/ai-chat*`) supplies chat UI, agent framework, LLM-transparency and Change Sets. Custom `LanguageModel` implementations are registered on the `LanguageModelRegistry` (no fixed contribution point — deliberate upstream choice); this is where the DIS-backed provider plugs in. Change Sets give the confirm-first review queue via custom `ChangeSetElement` implementations.
- **MCP client** (`@theia/ai-mcp`): the product consumes external MCP servers (Canon's Streamable-HTTP endpoint is a per-team config entry — never bundled). Server processes/connections are managed backend-side; tools surface to agents frontend-side.
- **MCP server (Phase C/D, `bumbl-mcp`)**: an MCP server exposed **from the Theia backend**, built on the command registry (`open_file`, `run_command`, `apply_edit`, `read_panel_state`, `list_open_editors`) so any external agent can drive the IDE semantically. Architecturally it is just another backend service with an MCP transport — same auth posture as DIS (loopback, token).
- Theia AI APIs are experimental upstream: isolate them behind small internal interfaces (one adapter module per upstream surface) so quarterly upgrades touch adapters, not features.

## Packaging & update architecture

- **Electron target**: electron-builder produces AppImage/deb/dmg/msi; auto-update via electron-updater against a release feed (GitHub releases or static HTTPS). Code-signing (macOS notarization, Windows signing) is a release-pipeline concern — plan certificates early (Phase E).
- **Browser target**: same extensions, `theia build`, served behind any HTTP server; keeps the frontend/backend boundary honest and enables future hosted deployment.
- **VS Code plugins** are resolved at build time from `theiaPlugins` (pinned .vsix URLs = the supply-chain allowlist) into `plugins/`; runtime installs from Open VSX can be enabled or locked down per product policy.
- Update cadence: app auto-update (weeks) is decoupled from Theia platform upgrades (quarterly) and from DIS releases (co-evolved; `system.capabilities` handshake lets the app degrade gracefully against an older/newer daemon).

## Version & upgrade strategy

- Pin **quarterly community releases** (e.g. 2026-05 ≙ Theia 1.69–1.71 consolidated), never monthly releases. Every `@theia/*` dependency at the identical version.
- Upgrade playbook per quarter: read breaking changes + News & Noteworthy → bump in a branch → fix DI/compile breaks → diff `@theia/ai-*` sources (experimental surface) → run Playwright smoke + manual three-theme QA → merge. Budget ~1–3 days/quarter; more when Theia AI shifts.
- Track upstream via the community-release announcements; file upstream issues rather than forking — `rebind()` covers most customization without patching.

## ADR checklist for Theia-product decisions

When writing ADRs in this space, make sure each records:

- **Layer choice** — Theia extension vs VS Code plugin vs backend service vs external daemon, justified against the placement table (this is the most-revisited decision class).
- **Upstream coupling** — which Theia internals (esp. experimental `@theia/ai-*`) the decision depends on, and the adapter that isolates them.
- **Both targets** — impact on the browser target, even if only Electron ships (the browser build is the boundary regression test).
- **Security posture** — where secrets live, what crosses the renderer boundary, Electron hardening assumptions (contextIsolation, no nodeIntegration, CSP).
- **Upgrade cost** — expected work at the next community release; rejected alternatives with the decision matrix where one exists (e.g. ADR-001's gpui/Tauri/Zed-fork/VS Code/JavaFX comparison).

## Risk register (standing)

| Risk | Impact | Mitigation |
|---|---|---|
| Electron footprint (~300–400MB installed, ~0.5–1GB RSS) | Perception vs native tools | Accepted trade for the ecosystem (ADR-001); keep DIS in Rust for the heavy lifting; monitor renderer memory |
| InversifyJS DI learning curve | Slow onboarding, runtime binding errors | House patterns in /fe reference; DI errors fail fast at startup — CI launches the app headless |
| Theia AI API churn (experimental) | Quarterly rework | Adapter isolation; pin releases; contribute upstream where APIs are missing |
| Frontend/backend boundary violations | Browser target breaks silently | CI builds+launches the browser target; lint rule against Node imports in `src/browser` |
| Open VSX supply chain | Malicious/broken third-party extensions | Pinned .vsix allowlist at build time; SECOPS reviews additions; runtime marketplace policy decision per product |
| Upstream regression in a pinned release | Blocked upgrade | Stay one community release behind at most; smoke suite before adoption; patch-level overrides via yarn resolutions as last resort |
| Two extension systems confusing contributors | Features built in the wrong layer | The placement table above is normative; /arch reviews any new extension's layer choice |
