# Backend Stack — Rust (tokio + axum)

> Loaded by /be for Rust backend work — above all the **bumbl-dis** intelligence daemon (`~/git/workspace/bumbl-dis`): tokio + axum HTTP/WS/SSE, JSON-RPC dispatch, rusqlite on a dedicated thread, streaming to the Anthropic Messages API. Patterns below cite the real bumbl-dis code; follow them rather than inventing parallel ones.

## Trigger

Use this reference alongside `backend-developer` when:
- Implementing or extending bumbl-dis modules (E1 streaming, E2 conversation store, E3 agent tools, E4 multimodal ingest, …)
- Writing axum routes (REST/WS/SSE) or JSON-RPC method handlers in Rust
- Persisting to SQLite via rusqlite from async code
- Streaming from the Anthropic Messages API (`"stream": true`) and re-emitting SSE
- Adding cancellation, error mapping, or tests to a tokio service

## Workspace & conventions

| Item | Value |
|---|---|
| Layout | Cargo workspace: `crates/bumbl-dis` (daemon) + `crates/bumbl-cli` |
| Edition / MSRV | `edition = "2024"`, `clippy.toml` → `msrv = "1.85.0"` |
| Core deps | tokio (full), axum 0.8 (`ws` feature), tower-http (cors/trace), reqwest 0.12 (json), rusqlite 0.32 (bundled), serde/serde_json, thiserror 2, tracing, tokio-stream, async-stream, futures-util |
| Lint gate | `cargo clippy` clean + `cargo test` green before review — non-negotiable |
| Module shape | One dir per domain (`src/memory`, `src/ai`, `src/knowledge`, …), each exposing `pub async fn handle(action, params, state) -> Result<Value, RpcError>` |

State is a single `Arc<Mutex<AppState>>` (`src/state.rs`) holding optional per-module stores (`memory_store: Option<MemoryStore>`, `conversations`, `sessions`, `auth_enabled`, …). Lock it briefly, clone what you need, drop the guard before awaiting anything slow.

## JSON-RPC dispatch (`src/rpc/dispatch.rs`)

Method strings are `module.action`; dispatch splits once and routes to the module handler:

```rust
pub async fn dispatch(method: &str, params: Value, state: &Arc<Mutex<AppState>>)
    -> Result<Value, RpcError>
{
    let parts: Vec<&str> = method.splitn(2, '.').collect();
    match parts.as_slice() {
        ["system", action] => system::handle(action, params, state).await,
        ["memory", action] => memory::handle(action, params, state).await,
        ["ai", action]     => ai::handle(action, params, state).await,
        // … one arm per module
        _ => Err(method_not_found(method)),
    }
}
```

`authenticated_dispatch(method, params, state, auth_token)` wraps this for HTTP/WS/SSE: public methods (`system.ping`, `system.capabilities`, `user.auth`, `user.init`) bypass auth; bootstrap methods only while `sessions.is_empty()`; otherwise it resolves the token (explicit `Authorization: Bearer` for REST > `params.token` for WS/SSE), validates the session, and checks RBAC — returning `AUTH_REQUIRED` / `AUTH_FAILED` / `FORBIDDEN` before ever reaching the module. **New RPC surface must go through `authenticated_dispatch`, and new public methods must be mirrored in both `PUBLIC_METHODS` lists (rpc/mod.rs + rpc/dispatch.rs).**

### Error codes (`src/rpc/types.rs`)

Standard JSON-RPC: `PARSE_ERROR -32700`, `INVALID_REQUEST -32600`, `METHOD_NOT_FOUND -32601`, `INVALID_PARAMS -32602`, `INTERNAL_ERROR -32603`. DIS-specific (excerpt): `NOT_INITIALIZED -32000`, `PATH_DENIED -32002`, `RESOURCE_EXHAUSTED -32003`, `CANCELLED -32004`, `MODEL_UNAVAILABLE -32005`, `CONVERSATION_NOT_FOUND -32011`, `TOOL_EXECUTION_ERROR -32017`, `AUTH_REQUIRED -32018`, `AUTH_FAILED -32019`, `FORBIDDEN -32020`. Map every module error to one of these — never invent ad-hoc codes; add a named constant if a genuinely new class appears, and cover it in the `test_all_error_codes_serialize`-style test.

```rust
Err(RpcError { code: INVALID_PARAMS, message: format!("Missing field: {name}"), data: None })
```

Domain errors use `thiserror` enums per module (`MemoryError { Database, InvalidParam, Closed }`) and are converted to `RpcError` at the handler boundary.

## HTTP layer (`src/http/`)

`create_router` merges per-transport routers and applies CORS + shared state:

```rust
pub fn create_router(state: Arc<Mutex<AppState>>) -> Router {
    Router::new()
        .merge(health::routes())
        .merge(rest::routes())   // POST /api/v1/rpc → authenticated_dispatch
        .merge(sse::routes())    // POST /api/v1/ai/stream
        .merge(ws::routes())
        .layer(cors)
        .with_state(state)
}
```

Security invariants: bind **127.0.0.1 only**; Bearer auth on by default; the Anthropic key lives only in the daemon's env (`GENOME_API_KEY` or `ANTHROPIC_API_KEY`) — never in responses, logs, or app config.

## Dedicated-thread SQLite (the `src/memory/mod.rs` pattern)

`rusqlite::Connection` is `!Sync` — do not share it across tasks or wrap it in a tokio Mutex. The proven pattern: one OS thread owns the connection; async callers send commands over `std::sync::mpsc` and get replies over `tokio::sync::oneshot`. E2's `ConversationStore` (`src/ai/store.rs`) must copy this template.

```rust
pub(crate) enum MemoryCommand {
    Store { key: String, value: String, scope: String, ttl: Option<u64>,
            reply: oneshot::Sender<Result<String, MemoryError>> },
    Search { query: String, top_k: usize,
             reply: oneshot::Sender<Result<Vec<SearchResult>, MemoryError>> },
    Close { reply: oneshot::Sender<Result<(), MemoryError>> },
}

pub struct MemoryStore {
    tx: Option<mpsc::Sender<MemoryCommand>>,
    thread: Option<JoinHandle<()>>,
    db_path: PathBuf,
}

impl MemoryStore {
    pub fn init(project_root: &Path) -> Result<Self, MemoryError> {
        let (tx, rx) = mpsc::channel::<MemoryCommand>();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();  // confirm schema init
        let thread = std::thread::spawn(move || {
            let conn = match Connection::open(&db_path_clone) { Ok(c) => c, Err(e) => {
                let _ = ready_tx.send(Err(MemoryError::Database(e.to_string()))); return; } };
            if let Err(e) = init_schema(&conn) { let _ = ready_tx.send(Err(e.into())); return; }
            let _ = ready_tx.send(Ok(()));
            db_thread_loop(conn, rx);      // while let Ok(cmd) = rx.recv() { match cmd { … } }
        });
        ready_rx.recv().map_err(|_| MemoryError::Database("DB thread died during init".into()))??;
        Ok(Self { tx: Some(tx), thread: Some(thread), db_path })
    }

    pub async fn store(&self, key: String, value: String, scope: String, ttl: Option<u64>)
        -> Result<String, MemoryError>
    {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.sender()?.send(MemoryCommand::Store { key, value, scope, ttl, reply: reply_tx })
            .map_err(|_| MemoryError::Closed)?;
        reply_rx.await.map_err(|_| MemoryError::Closed)?
    }
}

impl Drop for MemoryStore {
    fn drop(&mut self) {
        if let Some(handle) = self.thread.take() {
            drop(self.tx.take());   // closes the channel → unblocks rx.recv() → thread exits
            let _ = handle.join();
        }
    }
}
```

Schema init enables WAL (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`) and, for searchable stores, an FTS5 shadow table kept in sync via INSERT/DELETE/UPDATE triggers on the content table (see `init_schema` in memory/mod.rs). DBs live under `<project_root>/.bumbl/*.db`.

## SSE out (axum) — `src/http/sse.rs`

SSE endpoints return `Sse<impl Stream<Item = Result<Event, Infallible>>>` built with `async_stream::stream!`. Errors are emitted **as SSE events** (the HTTP status is already 200 once streaming starts):

```rust
async fn handle_sse_stream(State(app_state): State<Arc<Mutex<AppState>>>, Json(params): Json<Value>)
    -> Sse<impl Stream<Item = Result<Event, Infallible>>>
{
    let stream = async_stream::stream! {
        // validate params → yield Event::default().event("error").data(json!({…}).to_string())
        // happy path: yield deltas
        yield Ok(Event::default().event("delta")
            .data(json!({ "type": "delta", "text": text }).to_string()));
        yield Ok(Event::default().event("done")
            .data(json!({ "type": "done", "usage": usage }).to_string()));
    };
    Sse::new(stream)
}
```

Wire contract (keep stable for the Theia client): `event: delta` with `{"type":"delta","text":…}`, `event: done` with `{"type":"done","usage":{…}}`, `event: error` with `{"type":"error","code":…,"message":…}`.

## Streaming from the Anthropic Messages API (E1)

The current `ai.request` (`src/ai/mod.rs`) is non-streaming: reqwest POST to `https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, then word-splits the result for fake SSE. E1 replaces that with `"stream": true` and passes real deltas through. Upstream SSE event sequence (verified against platform.claude.com streaming docs):

```
event: message_start          → {"type":"message_start","message":{…}}
event: content_block_start    → {"type":"content_block_start","index":0,…}
event: content_block_delta    → {"type":"content_block_delta","index":0,
                                 "delta":{"type":"text_delta","text":"Hello"}}
event: content_block_stop     → {"type":"content_block_stop","index":0}
event: message_delta          → {"type":"message_delta","delta":{"stop_reason":"end_turn"},
                                 "usage":{"output_tokens":12}}
event: message_stop           → {"type":"message_stop"}
```

(Also handle `ping` events and `thinking_delta` deltas by skipping/branching on `delta.type`.)

```rust
let response = client.post("https://api.anthropic.com/v1/messages")
    .header("x-api-key", &key)
    .header("anthropic-version", "2023-06-01")
    .json(&json!({ "model": model, "max_tokens": 4096, "stream": true, "messages": api_messages }))
    .send().await?;

let mut bytes = response.bytes_stream();     // futures_util::StreamExt
let mut buf = String::new();
while let Some(chunk) = bytes.next().await {
    buf.push_str(std::str::from_utf8(&chunk?)?);
    while let Some(idx) = buf.find("\n\n") {                 // SSE frames end on a blank line
        let frame = buf[..idx].to_string(); buf.drain(..idx + 2);
        for line in frame.lines().filter_map(|l| l.strip_prefix("data: ")) {
            let ev: Value = serde_json::from_str(line)?;
            match ev["type"].as_str() {
                Some("content_block_delta") => {
                    if let Some(text) = ev["delta"]["text"].as_str() {
                        yield Ok(Event::default().event("delta")
                            .data(json!({"type":"delta","text":text}).to_string()));
                    }
                }
                Some("message_delta") => { /* accumulate usage.output_tokens */ }
                Some("message_stop")  => { /* yield done event with usage */ }
                _ => {}
            }
        }
    }
}
```

Model IDs move fast — take the model from params, keep the default in one constant, and verify current IDs against platform.claude.com/docs before bumping (the repo's `claude-sonnet-4-20250514` default predates the 2026 lineup; current-generation IDs are un-dated aliases like `claude-opus-4-8`).

## Cancellation (`ai.cancel`)

`ai.cancel` is currently a stub (`"cancellation not yet supported"`). E1 implements it with `tokio_util::sync::CancellationToken` (add `tokio-util = { version = "0.7", features = ["sync"] }`):

1. On stream start, create a token, store it in `AppState` keyed by `request_id`, return the id to the caller.
2. Race the upstream stream against the token:

```rust
tokio::select! {
    _ = cancel_token.cancelled() => {
        yield Ok(Event::default().event("error")
            .data(json!({"type":"error","code":CANCELLED,"message":"Request cancelled"}).to_string()));
        return;   // dropping the reqwest stream aborts the upstream HTTP request
    }
    chunk = bytes.next() => { /* … */ }
}
```

3. `ai.cancel { request_id }` looks up the token, calls `.cancel()`, responds `{"cancelled": true}`; unknown id → `{"cancelled": false}`. Always remove the token from state on completion/cancel (guard with a drop-guard so panics don't leak entries). Map cancellation to `CANCELLED (-32004)` everywhere.

## Testing

- Unit tests live in `#[cfg(test)] mod tests` at the bottom of each module (house style, incl. the `// ─── Unit Tests ───` banner).
- Async tests: `#[tokio::test]`; use `#[tokio::test(flavor = "current_thread")]` when mutating env vars (see sse.rs) — and save/restore any env you touch.
- HTTP handlers: build the router and drive it in-process with tower — no sockets:

```rust
let app = http::create_router(AppState::new());
let response = ServiceExt::<Request<Body>>::oneshot(app, request).await.expect("response");
assert_eq!(response.status(), StatusCode::OK);
let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.expect("read body");
```

- Filesystem-touching tests use `tempfile::TempDir`. Store tests exercise the real dedicated-thread store against a temp DB, not mocks.
- TDD applies: failing test first, then implementation; `cargo test -p bumbl-dis` + `cargo clippy` before handing to /rev.

## Pitfalls

| Pitfall | Consequence | Fix |
|---|---|---|
| Holding the `AppState` mutex across `.await` on network/DB calls | Daemon-wide stalls, potential deadlock | Lock, extract/clone, drop guard, then await (see `authenticated_dispatch`) |
| `rusqlite::Connection` in async context / behind tokio Mutex | `!Sync` compile errors or blocked runtime threads | Dedicated-thread + mpsc/oneshot pattern above |
| Forgetting the ready-channel handshake on store init | Callers race a half-initialized schema | Block `init` on the thread's `Ok(())` like `MemoryStore::init` |
| Emitting HTTP error status after SSE started | Client sees a broken stream, not an error | Errors are SSE `error` events; status is always 200 once streaming |
| Splitting Anthropic SSE on single `\n` | Corrupt JSON frames on chunk boundaries | Buffer and split on `\n\n`; `data:` lines only after a full frame |
| New method not in `PUBLIC_METHODS` sync | Auth bypass or false AUTH_REQUIRED | Update both lists (rpc/mod.rs + rpc/dispatch.rs) together, with a test |
| Ad-hoc error codes | Client can't map failures | Only `rpc/types.rs` constants; extend the serialization test when adding one |
| Leaked cancel tokens / conversations in `AppState` | Unbounded memory growth | Remove entries on completion; drop-guards for panic paths |
| Secrets in logs/`data` payloads | SECOPS gate failure | Never log or echo the API key or Bearer tokens; scrub via `security.redact` on egress |
| Skipping `cargo clippy` (MSRV 1.85) | Review bounce | Clippy clean is part of done; don't use features newer than the pinned MSRV |
