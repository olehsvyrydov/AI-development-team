/**
 * Deterministic project-state digest — the "workflow is never lost" floor.
 *
 * Reads the authoritative files ONLY (no embeddings, no network), so it always
 * succeeds as long as the files are readable. The SessionStart hook prints this
 * FIRST, before any best-effort semantic recall, so a fresh/resumed/compacted
 * session always knows the active workflow + where every ticket stands.
 *
 * CLI:  node src/digest.ts [projectDir] [--json|--text]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface Gate {
  state?: string;
  by?: string | null;
  at?: string | null;
  note?: string | null;
}
interface Ticket {
  title?: string;
  track?: string;
  stage?: string;
  assignee?: string | null;
  gates?: Record<string, Gate>;
}
type Ledger = Record<string, Ticket>;

/** Resolve the active workflow.yaml using the engine's documented cascade. */
export function findWorkflow(projectDir: string): string | null {
  const candidates = [
    path.join(projectDir, ".aidevteam", "workflow.yaml"),
    path.join(os.homedir(), ".aidevteam", "workflow.yaml"),
    path.join(projectDir, ".claude", "workflow", "workflow.yaml"),
  ];
  return candidates.find((p) => safeExists(p)) ?? null;
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
function safeRead(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function readPreset(projectDir: string): string {
  const wf = findWorkflow(projectDir);
  if (!wf) return "solo";
  const m = safeRead(wf).match(/^preset:\s*["']?([A-Za-z-]+)/m);
  return m?.[1] ?? "solo";
}

function readLedger(projectDir: string): Ledger {
  const p = path.join(projectDir, ".workflow-state.json");
  if (!safeExists(p)) return {};
  try {
    const v = JSON.parse(safeRead(p));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Ledger;
  } catch {
    /* malformed ledger → empty digest, never throw */
  }
  return {};
}

const norm = (s: string | undefined | null): string => String(s ?? "").toLowerCase().trim();

/** Build a structured digest object from the authoritative files. */
export function buildDigest(projectDir: string): {
  project: string;
  preset: string;
  tickets: Array<{
    id: string;
    title: string;
    stage: string;
    assignee: string | null;
    unmet: string[];
    rejected: string[];
  }>;
} {
  const ledger = readLedger(projectDir);
  const tickets = Object.entries(ledger)
    .filter(([, t]) => t && typeof t === "object")
    .map(([id, t]) => {
      const gates = t.gates ?? {};
      const unmet: string[] = [];
      const rejected: string[] = [];
      for (const [name, g] of Object.entries(gates)) {
        const st = norm(g?.state);
        if (st === "rejected") rejected.push(name);
        else if (st !== "passed" && st !== "approved") unmet.push(name);
      }
      return {
        id,
        title: t.title || id,
        stage: t.stage || t.track || "unknown",
        assignee: t.assignee ?? null,
        unmet,
        rejected,
      };
    });
  return { project: path.basename(projectDir), preset: readPreset(projectDir), tickets };
}

/** Render the digest as the markdown block injected at SessionStart. */
export function renderDigest(projectDir: string): string {
  const d = buildDigest(projectDir);
  if (!d.tickets.length) {
    // Still anchor the session in the active process even with no tickets yet.
    return `## Project Workflow State\nPreset: **${d.preset}**. No tickets in the ledger yet (\`.workflow-state.json\`). Consult the \`workflow-engine\` skill before development.`;
  }
  const lines = [
    "## Project Workflow State (from files — authoritative)",
    `Preset: **${d.preset}**. ${d.tickets.length} ticket(s) in the ledger. Follow the \`workflow-engine\` gates before advancing any of them.`,
    "",
  ];
  for (const t of d.tickets) {
    const who = t.assignee ? ` · ${t.assignee}` : "";
    const flags: string[] = [];
    if (t.rejected.length) flags.push(`REJECTED: ${t.rejected.join(", ")}`);
    if (t.unmet.length) flags.push(`pending: ${t.unmet.join(", ")}`);
    const tail = flags.length ? ` — ${flags.join("; ")}` : "";
    lines.push(`- **${t.id}** · ${t.stage}${who} — ${t.title}${tail}`);
  }
  return lines.join("\n");
}

// ---- CLI -------------------------------------------------------------------
function isMain(): boolean {
  return import.meta.url === `file://${process.argv[1]}`;
}
if (isMain()) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const dir = path.resolve(args.find((a) => !a.startsWith("-")) ?? process.cwd());
  if (json) process.stdout.write(JSON.stringify(buildDigest(dir), null, 2) + "\n");
  else process.stdout.write(renderDigest(dir) + "\n");
}
