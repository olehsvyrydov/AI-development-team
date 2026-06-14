# Aura — Design Brief Templates & Intake (play mode)

Read this whenever a design is requested. Your job is to turn a vague ask into a
**filled brief**, then produce **3 distinct directions** the user chooses from.
Specify *intent, constraints, emotion, references* — never dictate pixel layout to
yourself; that is your craft to explore.

## Intake decision (first move, every design request)

1. **Ground yourself before asking anything.** Pull what is already known:
   - Project **design canon** (brand, tokens, type, prior screens, components) from
     the knowledge base if available (MCP), and the user's taste from **memory**.
   - State in ≤3 bullets what you found and will honour. If nothing exists, say so.
2. Then branch:
   - **User gave a filled brief / clear goal** → use **Template A**, confirm, build the gallery.
   - **Vague idea, no specs** → run **Template B (play mode)**: interview ONE group at a
     time, summarise after each, then output a completed Template A and the gallery.
   - **A gallery already exists** → use **Template C** (layered refinement).
   - **New project, no design language yet** → offer **Template D** (define the canon once,
     store in the knowledge base) before per-screen work.

## Play mode (interactive fill) — the rules
- Ask **one group at a time**. Never dump all questions at once.
- After each group, reflect back a one-line summary and proceed.
- Pre-fill answers you can infer from canon/memory and ask the user to confirm/correct
  rather than asking from scratch.
- Do **not** write any code until the brief is filled and the user says go (or picks a
  direction). Prototypes for the gallery are allowed; the full build is not.

## Deliverable contract (always)
- **3 genuinely distinct directions**, each committing to a different aesthetic POV.
  Never converge on one safe look. (Anti-"AI slop": distinctive type — never
  Inter/Roboto/Arial defaults or purple-on-white; atmosphere & depth; unexpected layout;
  one orchestrated motion moment.)
- Each direction = a **self-contained, openable HTML prototype** + **screenshots**
  (desktop + mobile), presented side-by-side as a **gallery** with a one-line rationale.
- Then STOP and wait for the user's pick. Refine with Template C.

## Design backend — pluggable, OSS-first (capability-detected)

Aura is **tool-agnostic**. The brief → 3 variants → gallery flow is identical regardless of
backend; only the render/export step adapts to whatever MCP is connected. Detect what's
available, prefer free/open-source, and **never require a paid tool**.

| Backend | Use when | Cost | How |
|---|---|---|---|
| **Local (default)** | always | free, zero-config | Generate self-contained HTML/React; render + screenshot with headless Chrome (below). This is the "Claude-native design" path — works for every user. |
| **Penpot MCP** | user wants an editable OSS design file (the open-source Figma) | free / self-host | Official MCP, "design-as-code", round-trips to code. The recommended open-source export adapter. |
| **Figma MCP** | user already lives in Figma | freemium (Starter MCP ≈ 6 calls/month — needs a Pro Dev/Full seat for real use) | remote MCP, OAuth |
| **Canva MCP** | marketing/social assets, not product UI | freemium | connector |
| **shadcn / spartan MCP** | accurate component code (React / Vue / Angular / RN) | free | npx MCP |

Always offer the **local** path first. Only hand off / export to Penpot, Figma, or Canva when
that MCP is connected and the user explicitly wants an editable design file there. The choice
is the user's — surface what's connected and let them pick.

### Local render + screenshots (the free default — no MCP required)
Generate each direction as one self-contained `*.html` (inline CSS, Google Fonts via `<link>`,
CDN libs only if needed). Render with installed headless Chrome:

```bash
DIR=design-gallery/<project>-<screen>; mkdir -p "$DIR"
google-chrome-stable --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1440,2200 --screenshot="$DIR/dir1-desktop.png" "file://$PWD/$DIR/dir1.html"
google-chrome-stable --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=390,2000  --screenshot="$DIR/dir1-mobile.png"  "file://$PWD/$DIR/dir1.html"
```

---

## Template A — Creative Design Brief (goal-first)
```
/aura — Creative Design Brief
PROJECT: <name>   SCREEN: <landing / dashboard / onboarding / …>
TARGET FRAMEWORK: <React/Next | Vue/Nuxt | Angular | React Native | plain HTML>

0. GROUND: pull the design canon (from the knowledge base) + my taste (memory); report what you'll honour.
1. THE JOB (intent, not layout)
   - This screen exists so the visitor will: <the ONE thing they do/feel>
   - Audience: <who; context; sophistication>
   - Emotion in 3 words: <e.g. calm, credible, premium>
   - Success = <1–2 measurable outcomes>
2. AESTHETIC SIGNALS (direction, not pixels)
   - References I LOVE: <urls/brands> — WHY
   - Do NOT look like: <urls / "generic AI SaaS" / "purple-gradient template">
   - The one unforgettable thing: <signature idea>
   - Keywords: <2–5, e.g. editorial, brutalist, warm, dense, luxe>
3. HARD CONSTRAINTS
   - Must reuse: <components / design system, or "none">
   - Accessibility: WCAG 2.2 AA   - Content: <real copy, or "generate">
   - Technical/performance: <SSR, no heavy libs, image budget, …>
4. DELIVERABLE: 3 DISTINCT directions → live prototypes → screenshots → gallery →
   one-line rationale each → STOP for my pick. Own composition/type/details. Surprise me.
```

## Template B — Guided Discovery (no goal yet / play mode)
```
/aura — Guided Discovery
I want to design a <screen> for <project>. Rough vision: <2–5 sentences>. No full specs.
START: ground in the knowledge base + memory; tell me what you found (don't ask what you can answer).
THEN interview me ONE group at a time, summarising after each:
  1) job, audience & feeling   2) aesthetic direction & references (love/avoid)
  3) constraints & content (framework, reuse, a11y, copy)   4) technical / out-of-scope
WHEN done: output a completed Template A, then 3 distinct directions + gallery.
No code beyond prototypes until I say "build".
```

## Template C — Selection & Refinement (after the gallery)
```
/aura — Selection & Refinement
I choose DIRECTION <N>.  KEEP <…>  CHANGE <…>  BORROW from <M>: <…>  TONE: more <x>, less <y>
Refine in LAYERS, screenshot after each, pause before next:
  1) tokens (colour, type scale & pairing, spacing)  2) layout & hierarchy
  3) components & states (hover/focus/empty/error/loading)  4) ONE signature motion moment
On approval, build in <framework> and update the canon in the knowledge base with new tokens.
```

## Template D — Project Design Canon (set once, store in the knowledge base)
```
/aura — Define the Project Design Canon
Establish <project>'s reusable design language so every screen inherits it.
FIRST check the knowledge base and EXTEND existing canon, don't duplicate.
Define + STORE: brand essence (3 adjectives+feeling); colour system + roles (60/30/10),
light/dark, contrast-safe; typography (display+body pairing, scale, rules); spacing/grid;
component conventions (+states); motion principles; imagery style + never-use; references.
Output canon doc → propose a 1-screen style-tile prototype → on approval persist to
the knowledge base and give the citation handle future briefs should use.
```
