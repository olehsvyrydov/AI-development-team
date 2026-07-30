# Design Reference — Designing within Eclipse Theia

> Loaded by /ui (Aura) when designing panels, widgets, chat surfaces, modals, or theming for a Theia-based IDE product (e.g. **bumbl-app**). Theia is a VS Code-workbench-style shell: design *within* its layout and token system, not against it.

## Trigger

Use this reference when:
- Designing Bumbl panels/views (chat, review queue, agents room, personal KB, permission modals) on Theia's widget system
- Defining themes, color tokens, or iconography for a Theia product
- Doing design QA on Theia UI (dark/light parity, contrast, focus)

## Mental model: what a widget can and cannot control

Theia's application shell owns the workbench: main menu bar, activity/side bars, dock panels (`left`, `right`, `bottom`, `main`), tab bars, status bar. A widget you design:

- **Controls**: everything inside its own DOM node — layout, content, spacing, interaction states. Its tab **title, caption (tooltip), and icon**. Its toolbar items (via `TabBarToolbarContribution`).
- **Does not control**: where the user docks it, its size (user-resizable splitters), the tab bar's rendering, chrome around it, or the active theme. Panels can be moved, split, stacked, and minimized — design content to be **responsive from ~240px (narrow sidebar) to full main-area width**, degrade gracefully, and never assume a fixed aspect.
- Widgets scroll internally; the shell never scrolls. Design each panel with its own scroll container and sticky header/footer where needed (e.g. chat input + cost footer pinned to the bottom of the chat widget).

Deliverable implication: specify each Bumbl surface as (dock area + default rank) + a narrow-width layout + a wide layout, plus empty/loading/error states — not as a fixed-canvas mockup.

## Theming: VS Code-compatible color tokens

Theia adopts the VS Code color-token model. Every registered color is exposed as a CSS variable named `--theia-` + the token id with dots replaced by dashes:

| VS Code token | Theia CSS variable |
|---|---|
| `editor.background` | `--theia-editor-background` |
| `foreground` | `--theia-foreground` |
| `button.background` | `--theia-button-background` |
| `list.activeSelectionBackground` | `--theia-list-activeSelectionBackground` |
| `sideBar.background` | `--theia-sideBar-background` |
| `statusBar.background` | `--theia-statusBar-background` |
| `input.background`, `input.border` | `--theia-input-background`, `--theia-input-border` |
| `focusBorder` | `--theia-focusBorder` |
| `errorForeground` / `editorWarning.foreground` | `--theia-errorForeground` / `--theia-editorWarning-foreground` |

Rules:
1. **Never hard-code hex values in widget CSS.** Every color in a spec must name a token (existing, or a new `bumbl.*` token you define). This is what makes dark/light/high-contrast work for free.
2. Product themes are contributed as **VS Code theme JSON** (a theme extension with `contributes.themes`, consumed like any Open VSX plugin). The Bumbl brand theme is an ordinary theme file, one per variant:

```json
// bumbl-dark-color-theme.json (theme extension: contributes.themes → uiTheme "vs-dark")
{
  "name": "Bumbl Dark",
  "type": "dark",
  "colors": {
    "editor.background": "#16181d",
    "sideBar.background": "#131519",
    "statusBar.background": "#101215",
    "focusBorder": "#e8a33d",
    "button.background": "#e8a33d",
    "button.foreground": "#16181d",
    "bumbl.chat.userBubble": "#1f232b",
    "bumbl.chat.agentBubble": "#23272f",
    "bumbl.cost.warning": "#e8a33d",
    "bumbl.redaction.background": "#5a1f1f"
  }
}
```

3. Custom tokens: register via Theia's color contribution API with `defaults: { dark, light, hcDark, hcLight }` that **reference existing tokens** where possible, so third-party themes that know nothing about Bumbl still look coherent (verify the exact `ColorContribution`/`ColorRegistry` signature in the pinned Theia release before handoff):

```typescript
{ id: 'bumbl.chat.agentBubble',
  defaults: { dark: 'editorWidget.background', light: 'editorWidget.background',
              hcDark: 'editorWidget.background', hcLight: 'editorWidget.background' },
  description: 'Background of agent messages in the Bumbl chat.' }
```

Widget CSS then uses `background: var(--theia-bumbl-chat-agentBubble);`.

4. Derive, don't invent: prefer referencing semantic tokens (`list.*`, `input.*`, `badge.*`, `editorWidget.*`) over new raw colors. New tokens are for genuinely new semantics (cost meter, redaction highlight, proposal accept/reject).

## Typography rhythm

Use Theia's font variables — never import your own UI font into widgets:

- UI text: `var(--theia-ui-font-family)`; sizes `var(--theia-ui-font-size0/1/2/3)` (size1 is the base ~13px).
- Content/monospace (code, diffs, token counts): `var(--theia-code-font-family)`, `var(--theia-code-font-size)` — these follow the user's editor font preferences.
- Line height in dense panels: match the workbench's list rhythm (~22px rows) so Bumbl panels feel native next to Explorer/SCM views.
- Users change font size via preferences and OS zoom — specify spacing in `px` consistent with Theia's own stylesheets but test at 0.8×–1.5× zoom.

## Iconography

- Default icon set is **codicons** (`@vscode/codicons`): `iconClass: 'codicon codicon-comment-discussion'` on widgets/commands; inline as `<span class="codicon codicon-check">`. In command/menu labels Theia also supports the `$(icon-name)` syntax.
- Pick codicons first (users already know their semantics: `beaker`, `robot`, `shield`, `database`, `sparkle`). Custom Bumbl glyphs only for brand surfaces (activity-bar icon, welcome page, about dialog) — ship as SVG masked with `currentColor` (or a font class) so they recolor with the theme; never baked-in colors.
- Icon sizing: 16px is the workbench grid; activity bar 24px. Don't introduce odd sizes.

## Workbench surfaces you design against

- **Status bar**: entries are text + optional codicon, left/right aligned with priority; backgrounds only via status-bar tokens (e.g. warning/error states). Bumbl: DIS health dot + session cost live here — keep to ~2 compact entries.
- **View toolbars**: icon buttons (codicons) + overflow "…" menu; actions must also exist as commands (keyboard-reachable). No custom-styled buttons in the tab bar area.
- **Context menus**: native Theia menus built from contributed menu nodes — you specify structure/grouping/separators, not visual style.
- **Dialogs & modals**: use Theia's dialog framework styling (`editorWidget.*`/`input.*` tokens). Permission modals (bumbl-security) follow the dialog pattern: clear title, the exact command/path being requested in monospace, three explicit actions (ask-always / ask-once / trust-project), destructive-neutral button hierarchy via `button.*` and `button.secondary*` tokens.
- **Notifications/toasts**: reserve for transient outcomes; anything requiring a decision goes to a modal or the review (Change Sets) queue, never a toast.

## Dark/light parity workflow

1. Design dark-first (developer default) but define every token pair at the same time — a spec that lists only dark values is incomplete.
2. QA pass per theme: switch theme in-app (Settings → Color Theme) and screenshot each Bumbl surface in **dark, light, and high-contrast**; diff against spec.
3. Parity checklist per surface: no hard-coded colors leaking (search CSS for `#`/`rgb(`), imagery/illustrations legible on both, elevation still reads (borders in light themes often replace shadows), redaction/cost/status colors keep meaning without relying on hue alone.
4. Test with at least one popular third-party theme from Open VSX — that's the real proof the widget uses tokens correctly.

## Accessibility (WCAG 2.2 AA within Theia)

- **Focus**: every interactive element shows the theme focus ring — `outline: 1px solid var(--theia-focusBorder)` (match workbench offset); never `outline: none` without replacement. Full keyboard paths: panels reachable via commands/keybindings, chat input → send → messages traversal, review queue accept/reject operable by keyboard.
- **Contrast**: ≥4.5:1 text, ≥3:1 UI components — validate your token *defaults* in both dark and light; document the measured ratios in the spec.
- **Semantics**: widgets are plain DOM — use semantic HTML + ARIA (chat log = `role="log"` with `aria-live="polite"` for streaming; proposal list = listbox/list semantics; modals trap focus and restore it on close).
- **Motion**: streaming/typing indicators and panel transitions respect `prefers-reduced-motion` — provide non-animated equivalents.
- Screen-reader check: streaming replies should announce in chunks (sentence-level), not per-token.

## Styling React widgets consistently

- One stylesheet per extension (`src/browser/style/index.css`), classes prefixed `bumbl-`; loaded by the frontend module. No CSS-in-JS runtime, no Tailwind — Theia's stylesheets + variables are the design system here.
- Reuse Theia primitives before inventing: `theia-input`, `theia-button` (+ `secondary`), tree/list classes — spec "Theia button, primary" instead of drawing a new button.
- Elevation/overlays: `editorWidget.background` + `widget.shadow`; borders from `contrastBorder`/`panel.border` tokens so high-contrast themes work.

## Design-spec conventions for Theia surfaces

Every Bumbl panel spec (`approvals/ui-designs/{ticket}.md`) should contain, in this order:

1. **Surface definition** — widget id, dock area + rank, toggle command + keybinding, tab icon (codicon name).
2. **Layout** — wide (≥600px) and narrow (240px) wireframes; internal scroll region; sticky elements.
3. **Token table** — every color used: `element → token (existing | new bumbl.*) → dark value → light value → measured contrast`.
4. **Typography** — which font variable + size step per text role.
5. **States** — empty, loading (skeleton matching layout), error (with recovery action), streaming (for chat), disabled/read-only.
6. **Interaction** — keyboard map, focus order, ARIA roles, reduced-motion behavior.
7. **QA screenshots** — dark / light / high-contrast after implementation (Design QA step).

Example token-table rows:

| Element | Token | Dark | Light | Contrast |
|---|---|---|---|---|
| Chat user bubble bg | `bumbl.chat.userBubble` (new) | `#1f232b` | `#eef0f4` | text 11.2:1 / 10.8:1 |
| Cost footer warning | `bumbl.cost.warning` (new) | `#e8a33d` | `#8a5a00` | 5.1:1 / 5.6:1 |
| Accept button | `button.background` (existing) | theme | theme | theme-owned |

## Pitfalls

| Pitfall | Consequence | Fix |
|---|---|---|
| Hard-coded colors/fonts in widget CSS | Breaks theme switching, fails parity QA | Tokens + font variables only; add `bumbl.*` tokens for new semantics |
| Fixed-size panel designs | Layout collapses when user re-docks/resizes | Spec 240px-narrow and wide variants; internal scroll |
| Custom icon style mixed with codicons | Visual noise, non-native feel | Codicons by default; brand SVGs recolored via `currentColor` |
| Decision UX in toasts | Users miss irreversible choices | Modals or Change Set review queue for anything requiring consent |
| Only dark theme specified | Light/HC ships broken | Token pairs + three-theme QA screenshots are part of DESIGN_APPROVED |
| Killing focus outlines for aesthetics | WCAG 2.2 failure, keyboard users lost | `--theia-focusBorder` ring everywhere, verified in QA |
| Redesigning shell chrome (tabs, splitters, menus) | Fights the platform, breaks on Theia upgrades | Design inside the widget boundary; chrome is themed via tokens only |
