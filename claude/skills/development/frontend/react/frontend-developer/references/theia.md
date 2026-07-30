# Frontend Stack — Eclipse Theia

> Loaded by /fe when the project is a Theia-based IDE product (Theia deps in package.json, `theiaExtensions` field, `applications/electron` + `extensions/*` monorepo — e.g. **bumbl-app**). The Theia extension-development playbook.

## Trigger

Use this reference alongside `frontend-developer` when:
- Building Eclipse Theia extensions or a branded Theia IDE product
- Creating React widgets, views, commands, menus, or keybindings in Theia
- Implementing Theia AI features (custom LanguageModel, Chat agents, Change Sets, MCP)
- Wiring frontend↔backend JSON-RPC services or a child-process supervisor
- Packaging with electron-builder or consuming VS Code extensions from Open VSX

## Versions & pinning

| Item | Value | Notes |
|---|---|---|
| Theia | **Quarterly community release** (latest: **2026-05**, based on 1.69–1.71) | Pin ALL `@theia/*` deps to the exact same version. Never mix monthly releases. |
| Node | Per the pinned release's engines field | Check `eclipse-theia/theia` repo for the release |
| Package manager | yarn (workspaces) | The generator scaffolds yarn workspaces |
| API docs | `eclipse-theia.github.io/theia/docs/next/` | Verify signatures here before use |

Upgrade cadence: move community release → community release (quarterly), never chase monthlies. Read the release's "News and Noteworthy" + breaking-changes list first.

## Scaffolding

```bash
npm install -g yo generator-theia-extension
mkdir bumbl-app && cd bumbl-app
yo theia-extension   # pick "Hello World" or "Widget" template; generates browser + electron apps
```

Monorepo layout (bumbl-app convention):

```
package.json                # yarn workspaces; ALL @theia/* pinned to the community release
applications/
  electron/package.json     # desktop product (electron-builder targets)
  browser/package.json      # free second target
extensions/
  bumbl-chat/               # one npm package per extension
    package.json
    src/browser/            # frontend (DOM, widgets, contributions)
    src/node/               # backend (Node.js — child processes, HTTP clients)
    src/common/             # shared protocol types + service paths
```

## Extension anatomy

An extension is an npm package with the `theia-extension` keyword and a `theiaExtensions` entry pointing at its DI modules:

```json
{
  "name": "bumbl-chat",
  "keywords": ["theia-extension"],
  "dependencies": { "@theia/core": "1.71.0" },
  "theiaExtensions": [{
    "frontend": "lib/browser/bumbl-chat-frontend-module",
    "backend": "lib/node/bumbl-chat-backend-module"
  }]
}
```

Each module default-exports an InversifyJS `ContainerModule`:

```typescript
// src/browser/bumbl-chat-frontend-module.ts
import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(BumblChatCommandContribution);
    bind(MenuContribution).to(BumblChatMenuContribution);
});
```

Key DI facts:
- Import inversify via `@theia/core/shared/inversify` (Theia re-exports it — avoids version skew).
- `bind(X).to(Impl).inSingletonScope()` for services; `bind(Contribution).to(Impl)` for contribution points (Theia collects all bindings of a contribution symbol).
- `rebind(X).to(MyImpl)` replaces an upstream default (used for branding: rebind `AboutDialog`, application shell pieces, etc.).
- `@injectable()` on every bound class; `@inject(Dep)` on constructor params or properties; `@postConstruct()` for init that needs injected deps.

## Commands, menus, keybindings

```typescript
import { injectable, inject } from '@theia/core/shared/inversify';
import {
    Command, CommandContribution, CommandRegistry,
    MenuContribution, MenuModelRegistry, MessageService
} from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { CommonMenus } from '@theia/core/lib/browser';

export const BumblPingCommand: Command = { id: 'bumbl.ping', label: 'Bumbl: Ping DIS' };

@injectable()
export class BumblChatCommandContribution implements CommandContribution {
    @inject(MessageService) protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(BumblPingCommand, {
            execute: () => this.messageService.info('pong'),
            isEnabled: () => true,
        });
    }
}

@injectable()
export class BumblChatMenuContribution implements MenuContribution {
    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: BumblPingCommand.id, label: 'Ping DIS'
        });
    }
}

@injectable()
export class BumblChatKeybindingContribution implements KeybindingContribution {
    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({ command: BumblPingCommand.id, keybinding: 'ctrlcmd+alt+p' });
    }
}
```

Bind all three in the frontend module. Keybinding syntax uses `ctrlcmd` (Ctrl on Linux/Win, Cmd on macOS).

## React widgets & dockable views

```typescript
import * as React from '@theia/core/shared/react';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';

@injectable()
export class BumblChatWidget extends ReactWidget {
    static readonly ID = 'bumbl.chat.widget';
    static readonly LABEL = 'Bumbl Chat';

    @postConstruct()
    protected init(): void {
        this.id = BumblChatWidget.ID;
        this.title.label = BumblChatWidget.LABEL;
        this.title.caption = BumblChatWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-comment-discussion';
        this.update();  // triggers render()
    }

    protected render(): React.ReactNode {
        return <div className='bumbl-chat'>{/* JSX */}</div>;
    }
}
```

Register a factory + view contribution so the widget is dockable and restorable:

```typescript
import { WidgetFactory, bindViewContribution } from '@theia/core/lib/browser';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';

@injectable()
export class BumblChatViewContribution extends AbstractViewContribution<BumblChatWidget> {
    constructor() {
        super({
            widgetId: BumblChatWidget.ID,
            widgetName: BumblChatWidget.LABEL,
            defaultWidgetOptions: { area: 'right', rank: 100 },  // 'left' | 'right' | 'bottom' | 'main'
            toggleCommandId: 'bumbl.chat.toggle',
        });
    }
}

// frontend module:
export default new ContainerModule(bind => {
    bindViewContribution(bind, BumblChatViewContribution);
    bind(BumblChatWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: BumblChatWidget.ID,
        createWidget: () => ctx.container.get<BumblChatWidget>(BumblChatWidget),
    })).inSingletonScope();
});
```

`bindViewContribution` wires the contribution as CommandContribution + MenuContribution + KeybindingContribution in one call. Call `this.update()` after state changes; React state hooks inside child components work normally.

## Frontend↔backend JSON-RPC

The frontend runs in the browser/Electron renderer; the backend is a Node process. **Anything touching child processes, the filesystem, or localhost HTTP clients (the bumbl-dis client + supervisor) lives on the backend (`src/node`)**; the frontend talks to it over a JSON-RPC proxy.

```typescript
// src/common/dis-protocol.ts — shared protocol
export const disServicePath = '/services/bumbl-dis';
export const DisService = Symbol('DisService');
export interface DisService {
    ping(): Promise<{ pong: boolean }>;
    setClient(client: DisClient): void;      // for backend→frontend notifications
}
export interface DisClient {
    onDisStatusChanged(status: string): void;
}
```

```typescript
// src/node/bumbl-dis-backend-module.ts
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';

export default new ContainerModule(bind => {
    bind(DisService).to(DisServiceImpl).inSingletonScope();   // spawns/supervises bumbl-dis here
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<DisClient>(disServicePath, client => {
            const service = ctx.container.get<DisService>(DisService);
            service.setClient(client);
            return service;
        })
    ).inSingletonScope();
});
```

```typescript
// src/browser/... — frontend proxy
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';

bind(DisService).toDynamicValue(ctx => {
    const connection = ctx.container.get(WebSocketConnectionProvider);
    return connection.createProxy<DisService>(disServicePath, myDisClientImpl);
}).inSingletonScope();
```

Every method call on the proxy becomes a JSON-RPC request over the websocket channel at `disServicePath`. The optional second `createProxy` argument is the local object the backend can call back (push notifications). Protocol types must be JSON-serializable — no class instances, no functions.

Child-process supervision (backend side): spawn `bumbl-dis` with `child_process.spawn` in a `BackendApplicationContribution` (`onStart`/`onStop` hooks from `@theia/core/lib/node`), watch exit events, respawn with backoff, and expose health over the RPC service.

## Theia AI

Packages: `@theia/ai-core`, `@theia/ai-chat`, `@theia/ai-chat-ui`, `@theia/ai-mcp`. APIs are still marked experimental upstream — re-verify against the pinned release's sources on every upgrade.

### Custom LanguageModel (delegating to an HTTP/SSE backend)

Theia AI deliberately has **no fixed contribution point** for language models. Implement the `LanguageModel` interface from `@theia/ai-core` and register instances with the `LanguageModelRegistry`:

```typescript
this.languageModelRegistry.addLanguageModels([new BumblDisLanguageModel(disClient)]);
```

Model the implementation on the upstream providers — `@theia/ai-openai` and `@theia/ai-ollama` are the reference implementations for a streaming HTTP provider (copy the request/stream-response shape from the pinned release's source; the exact `LanguageModel.request(...)` signature evolves — verify in `@theia/ai-core` before coding). For bumbl: the model's request method calls the backend RPC service, which streams from DIS `POST /api/v1/ai/stream`; deltas are forwarded to the frontend and yielded as the model's streamed response parts.

### Chat agents

```typescript
import { AbstractStreamParsingChatAgent, ChatAgent } from '@theia/ai-chat';
import { Agent } from '@theia/ai-core';

@injectable()
export class BumblChatAgent extends AbstractStreamParsingChatAgent {
    id = 'bumbl';
    name = 'Bumbl';
    languageModelRequirements = [{ purpose: 'chat', identifier: 'bumbl-dis' }];
    // systemPromptId / prompts: reference prompt fragments; modes = [{id:'ask',name:'Ask'},{id:'plan',name:'Plan'}]
}

// module:
bind(BumblChatAgent).toSelf().inSingletonScope();
bind(Agent).toService(BumblChatAgent);
bind(ChatAgent).toService(BumblChatAgent);
```

Selected chat mode arrives on the request (`request.request.modeId` — verify field path in the pinned release). Tool functions: implement `ToolProvider` (`getTool()`) and `bind(ToolProvider).to(MyTool)`; variables: `bind(AIVariableContribution).to(MyVariable).inSingletonScope()`.

### Change Sets (confirm-first review queue)

`ChangeSetElement` (interface) + `ChangeSetImpl` in `@theia/ai-chat`. Elements are identified by a `uri`, control their own label/icon/additional info, and can implement open/accept/discard actions. A file-change implementation ships by default; bumbl-review implements a **custom** element type for DIS proposals (memory writes, knowledge conflicts, agent outputs) whose accept/discard call `approval.*` on DIS.

### MCP & token usage

- `@theia/ai-mcp` provides the MCP client integration (servers configured via preferences; tools surfaced to agents). For bumbl, Canon's Streamable-HTTP MCP endpoint is registered here as an optional per-team entry.
- Token usage: Theia AI surfaces per-request token counts from providers; the exact service name is not stable in docs — **verify in `@theia/ai-core` sources** (search for "token usage") before building the cost footer. Fallback: DIS already returns `usage` per request; render the cost footer from DIS data and treat Theia's surface as additive.

## Consuming SSE/WebSocket streams in the frontend

Backend-mediated (preferred — keeps the Bearer token in the Node process): backend consumes DIS SSE with `fetch` + `response.body` ReadableStream, forwards deltas over the RPC client callback. Direct from the renderer (acceptable for loopback):

```typescript
const response = await fetch('http://127.0.0.1:7433/api/v1/ai/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages }),
    signal: abortController.signal,          // cancellation
});
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buf = '';
for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {          // SSE events end with a blank line
        const rawEvent = buf.slice(0, idx); buf = buf.slice(idx + 2);
        for (const line of rawEvent.split('\n')) {
            if (line.startsWith('data: ')) appendDelta(JSON.parse(line.slice(6)));
        }
    }
}
```

Note `EventSource` only supports GET — DIS streaming is POST, so use fetch-streaming (above) or the WS transport. In the chat widget, append deltas to component state and call `this.update()`; throttle re-renders (~30ms batches) for long streams.

## Packaging & Open VSX

`applications/electron/package.json` — electron-builder config (`build` section): targets AppImage/deb (Linux), dmg (macOS), msi/nsis (Windows); auto-update via `electron-updater` with a publish provider (GitHub releases or generic HTTP). The browser app is built with `theia build` and served — keep it compiling in CI even if not shipped.

VS Code extensions are consumed as **built-time plugins** from Open VSX:

```json
{
  "theiaPluginsDir": "plugins",
  "theiaPlugins": {
    "rust-lang.rust-analyzer": "https://open-vsx.org/api/rust-lang/rust-analyzer/latest/file/rust-lang.rust-analyzer-latest.vsix"
  },
  "theiaPluginsExcludeIds": ["vscode.extension-editing", "vscode.github"]
}
```

`theia download:plugins` fetches them at build time. Pin exact .vsix versions for reproducible builds (supply-chain: this doubles as the extension **allowlist** — SECOPS reviews additions). Users can additionally install from Open VSX at runtime unless you disable/scope the marketplace.

## Testing — Playwright for Theia

`@theia/playwright` is a page-object framework over Playwright (browser + Electron):

```typescript
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from '@theia/playwright';

test('opens the app and pings DIS', async ({ playwright, browser }) => {
    const ws = new TheiaWorkspace(['tests/resources/sample-workspace']);
    const app: TheiaApp = await TheiaAppLoader.load({ playwright, browser }, ws);
    // built-in page objects: TheiaTextEditor, explorer, menus, status bar…
});
```

Extend with custom page objects for bumbl widgets. Start from `eclipse-theia/theia-playwright-template`. Unit tests: standard jest/mocha per extension; DI makes services mockable (`Container` with test bindings).

## Pitfalls

| Pitfall | Consequence | Fix |
|---|---|---|
| Mixed `@theia/*` versions | Cryptic DI/runtime failures | Pin every `@theia/*` dep to the exact community-release version; use resolutions if a transitive dep drifts |
| Importing `inversify`/`react` directly | Duplicate module instances → DI + hooks break | Always import via `@theia/core/shared/*` |
| Missing `@injectable()` / binding | `No matching bindings found for serviceIdentifier` at startup | Every injected class needs the decorator AND a `bind()` in a loaded module; check `theiaExtensions` paths point at compiled `lib/**` output |
| Node APIs in `src/browser` | Works in Electron dev, breaks browser target & security posture | Filesystem/child-process/HTTP-client code goes in `src/node` behind an RPC service |
| Non-serializable RPC payloads | Silent data loss over JSON-RPC | Protocol types = plain JSON data; convert URIs/classes at the boundary |
| Electron security defaults loosened | Fails SECOPS gate | Keep `contextIsolation: true`, no `nodeIntegration` in views, strict CSP; secrets (DIS token, API keys) never reach the renderer |
| Theia AI APIs assumed stable | Breakage on quarterly upgrade | They're experimental: diff `@theia/ai-*` sources on each community-release bump before upgrading |
| `EventSource` for POST streams | No request body support | Use fetch-streaming or route via the backend RPC service |
| Forgetting `this.update()` | Widget renders stale UI | Call after every externally-driven state change in `ReactWidget` |
