# Edit-workflow framing — "Edit workflow" must read as editing the workflow

**Author:** Aura (/ui) · **Type:** UX bug-fix (labeling/chrome reframe, not a redesign) · **Status:** build-ready

## The bug

The Workflow panel's **Edit workflow** button correctly opens the board armed in
pipeline EDIT-mode, but the destination still wears the **"Tasks board"** title and the
**Worklist / Pipeline** task-view switch. So clicking "Edit workflow" reads as "go to the
tasks pipeline," not "edit the workflow." The one-control-plane wiring is right; only the
chrome lies about where you are.

This is a pure reframe keyed on the signals that already exist:
`boardStartInEdit()` in `project-shell.component.ts` and `startInEdit()` in
`tasks-board.component.ts`. No new state, no data changes, no redesign.

## Decisions

### 1. Title + back-label per entry mode

The board view has two entry points into one section. The title and back-label become
mode-dependent on `boardStartInEdit()`.

| Entry | Trigger | Title (`board-view__title`) | Back button label (`board-back`) |
|-------|---------|-----------------------------|----------------------------------|
| Open board | `openBoard()` → `boardStartInEdit=false` | **Tasks board** | **Back to panels** |
| Edit workflow | `openWorkflowEditor()` → `boardStartInEdit=true` | **Edit workflow** | **Done editing** |

Rationale: the title is the single strongest signal of "where am I." Swapping it to
**Edit workflow** resolves the whole complaint. The back-label shifts from a neutral
"Back to panels" to **Done editing** because in this entry the user came to *do a thing*;
"Done editing" frames the exit as finishing the task (it still returns to panels — only the
word changes, the action is identical). Keep `board-view` markup, testid, and
`aria-label` swap in lockstep with the title so screen readers hear "Edit workflow" too.

### 2. The Worklist / Pipeline switch in workflow-edit entry → **(a) hide it entirely**

When `startInEdit()` is true, **do not render the `view-mode-switch` radiogroup.** You
came to edit the stage chain; offering "browse tasks as a worklist" here is exactly the
confusion the user hit. The pipeline is already force-rendered in this mode
(`effectiveMode = startInEdit ? 'pipeline' : …`), so the switch is decorative-at-best and
misleading-at-worst.

**No dead-end:** the route to the task views stays one obvious click away —
**Done editing** → back on the panels, the **Tasks** panel's **Open board** affordance
lands you on the real Tasks board with both views and the switch present. The worklist was
never reachable *through* the editor anyway; it's reachable *next to* it. That's correct:
editing the workflow and browsing tasks are two trips, not one toggle.

Plain **Open board** entry is unchanged — switch renders exactly as today.

### 3. Edit vs View (Pipeline-mode) toggle on entry → **keep it visible**

The pipeline's own `[View | Edit]` toggle stays. It is the *correct* control for this
screen: the user is editing the workflow, and previewing the read-only chain ("what will
the team see?") without leaving is a legitimate, expected move. Hiding it would strand them
in edit with no preview. It arms to **Edit** on entry (already wired via `armEdit=startInEdit`);
flipping to **View** and back is the in-context escape hatch — distinct from the
task-view switch we removed, which changed *what you're looking at* rather than *whether
you're editing it*.

### 4. Coherence walk-through

Click **Edit workflow** → land on a screen titled **Edit workflow**, no task-view switch,
the editable stage chain front and center with grips / owner pickers / gate editors /
insert-slots, the `[View | Edit]` toggle armed to Edit, the "Edit mode on…" announcement,
the "Workflow settings" button, the "saves to this project only" banner, and **Done
editing** to leave. Nothing on screen says "tasks board." The complaint is resolved.

#### ASCII — Edit-workflow entry (`boardStartInEdit = true`)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ‹ Done editing                                  Edit workflow        │   ← back-label + title both reframed
├──────────────────────────────────────────────────────────────────────┤
│  ⓘ Tasks for Acme-Web                                                  │   (project cue unchanged)
│                                          ┌─────────────────────────┐  │
│                  (NO Worklist|Pipeline)  │ Pipeline mode  View │■Edit│  │   ← task-view switch HIDDEN; edit/view toggle KEPT
│                                          └─────────────────────────┘  │
│  ✎ Edit mode on — stages, owners and gates are now editable           │
│  ⓘ Changes save to this project only.                  [Workflow ⚙]   │
│                                                                        │
│   ┌──────┐  ＋  ┌──────┐  ＋  ┌──────┐  ＋  ┌──────┐                    │
│   │ ⠿ PO │ ───▶ │ ⠿ Arch│ ───▶│ ⠿ Dev │ ───▶│ ⠿ QA  │   ⠿ grips,       │
│   │ owner│      │ owner │     │ owner │     │ owner │   owner pickers,  │
│   │ gate▾│      │ gate▾ │     │ gate▾ │     │ gate▾ │   gate editors    │
│   └──────┘      └──────┘      └──────┘      └──────┘                    │
└──────────────────────────────────────────────────────────────────────┘
```

#### ASCII — plain Open-board entry (`boardStartInEdit = false`) — UNCHANGED

```
┌──────────────────────────────────────────────────────────────────────┐
│  ‹ Back to panels                                Tasks board          │
├──────────────────────────────────────────────────────────────────────┤
│  ⓘ Tasks for Acme-Web                                                  │
│  ☰ 12 tasks   ● 3 need you            ┌ View ─────────────────────┐    │
│                                       │ ☰ Worklist │ ▷ Pipeline   │    │   ← task-view switch present as today
│                                       └───────────────────────────┘    │
│  … worklist bands / pipeline columns …                                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Behavioural acceptance criteria (for /fe)

1. When the board view is opened via **Edit workflow** (`boardStartInEdit` true), the
   header title reads **Edit workflow** and the back button reads **Done editing**; the
   section's accessible name matches the visible title.
2. When the board view is opened via **Open board** (`boardStartInEdit` false), the title
   reads **Tasks board** and the back button reads **Back to panels** (unchanged).
3. When entered via **Edit workflow** (`startInEdit` true), the **Worklist / Pipeline**
   view-mode switch is **not rendered**.
4. When entered via **Open board**, the **Worklist / Pipeline** view-mode switch renders
   and behaves exactly as before.
5. In **Edit workflow** entry the pipeline's `[View | Edit]` toggle remains visible and
   armed to **Edit**, and toggling to **View** shows the read-only chain without leaving
   the screen.
6. **Done editing** returns to the panels; from there **Open board** reaches the full Tasks
   board (with the view-mode switch) — i.e. the task views remain reachable, no dead-end.
```
