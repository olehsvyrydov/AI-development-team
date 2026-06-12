#!/usr/bin/env node
/**
 * UserPromptSubmit hook — deliver newly-pending directives to a live session.
 *
 * On every user turn this surfaces the project's directives that are BOTH
 * unconsumed (file-derived projection) AND not-yet-shown in this session, as
 * fenced QUOTED DATA produced by the hub's unchanged renderer. It is read-only
 * with respect to the project: the only side effect is an advisory, session-
 * scoped "seen" marker stored OUTSIDE any project (under ~/.aidevteam/sessions).
 *
 * Structure mirrors the SessionStart hook: deterministic file-derived data
 * first, time-boxed, errors to stderr only (stdout is injected as context), and
 * ALWAYS exit 0 — it never blocks or rejects the user's prompt.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { aidevteamHome } from "../lib/paths.ts";
import { readStdinJson } from "./common.ts";

const require = createRequire(import.meta.url);

/** Hub digest CLI path, resolved relative to this hook (repo/hub/lib/digest.js). */
const HUB_DIGEST = path.resolve(import.meta.dirname, "../../../../hub/lib/digest.js");

/** Tight internal deadline for the single digest child process. */
const DIGEST_TIMEOUT_MS = 1500;

/** Bound on how much of the transcript tail is scanned for shown-sentinels. */
const TRANSCRIPT_TAIL_BYTES = 64 * 1024;

/** A session_id is only safe as a filename when it is this exact opaque shape. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Heading the injected block is filed under. */
const HEADING = "## New directives since your last turn";

interface Directive {
  ticket: string;
  id: string;
  target: string[];
  prompt: string;
  at: string | null;
}

/** The renderer reused UNCHANGED from the hub — the hook never forks rendering. */
type RenderDirectiveSection = (
  ticket: { pendingDirectives: Directive[]; permittedLabels: string[] },
  lines: string[],
  labels: Record<string, unknown>,
) => void;

function loadRenderer(): RenderDirectiveSection {
  const digest = require(HUB_DIGEST) as { renderDirectiveSection: RenderDirectiveSection };
  return digest.renderDirectiveSection;
}

/**
 * Read the rolled-up pending-directive projection for a project, bound to `cwd`
 * only. Prefer the hub digest CLI (the same deterministic, overlay-aware path
 * the board uses); fall back to the in-process pure read; on any failure return
 * an empty list so the turn proceeds silently.
 */
function pendingDirectivesFor(cwd: string): Directive[] {
  try {
    if (fs.existsSync(HUB_DIGEST)) {
      const out = execFileSync("node", [HUB_DIGEST, cwd, "--json"], {
        encoding: "utf8",
        timeout: DIGEST_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const state = JSON.parse(out);
      if (Array.isArray(state.directives)) return state.directives as Directive[];
    }
  } catch (e) {
    process.stderr.write(`[live-directives] digest CLI failed: ${(e as Error).message}\n`);
  }
  try {
    const { buildState } = require(HUB_DIGEST.replace(/digest\.js$/, "state.js")) as {
      buildState: (dir: string) => { directives?: Directive[] };
    };
    const state = buildState(cwd);
    if (Array.isArray(state.directives)) return state.directives;
  } catch (e) {
    process.stderr.write(`[live-directives] in-process projection failed: ${(e as Error).message}\n`);
  }
  return [];
}

/** Path to a session's advisory seen-file, or null if the id is unsafe. */
function seenFilePath(sessionId: string): string | null {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  return path.join(aidevteamHome(), "sessions", `${sessionId}.seen`);
}

/** Directive ids already shown this session, from the transcript tail then the seen-file. */
function loadSeen(transcriptPath: unknown, seenPath: string | null): Set<string> {
  const seen = new Set<string>();
  collectFromTranscript(transcriptPath, seen);
  collectFromSeenFile(seenPath, seen);
  return seen;
}

/** Scan only the bounded tail of the transcript for the hook's own shown-sentinels. */
function collectFromTranscript(transcriptPath: unknown, seen: Set<string>): void {
  if (typeof transcriptPath !== "string" || !transcriptPath) return;
  try {
    const stat = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - TRANSCRIPT_TAIL_BYTES);
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const length = stat.size - start;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      addSentinelIds(buf.toString("utf8"), seen);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    process.stderr.write(`[live-directives] transcript scan skipped: ${(e as Error).message}\n`);
  }
}

function collectFromSeenFile(seenPath: string | null, seen: Set<string>): void {
  if (!seenPath) return;
  try {
    for (const line of fs.readFileSync(seenPath, "utf8").split("\n")) {
      const id = line.trim();
      if (id) seen.add(id);
    }
  } catch {
    /* absent/unreadable seen-file → nothing seen yet via this channel */
  }
}

/**
 * The sentinel a shown directive is marked by — matched ONLY at the start of a
 * line (column 0). The hook emits sentinels un-indented, OUTSIDE the fenced data
 * block; the renderer indents every fenced directive-body line, so a forged
 * sentinel inside a directive body is never at column 0 and cannot be honored.
 */
const SENTINEL_RE = /^<!-- dart:directive-shown id=([A-Za-z0-9._-]+) -->$/gm;

function addSentinelIds(text: string, seen: Set<string>): void {
  for (const m of text.matchAll(SENTINEL_RE)) seen.add(m[1]);
}

function sentinelFor(id: string): string {
  return `<!-- dart:directive-shown id=${id} -->`;
}

/** Append shown ids to the session seen-file with tight perms; swallow failures. */
function recordSeen(seenPath: string | null, ids: string[]): void {
  if (!seenPath || !ids.length) return;
  try {
    fs.mkdirSync(path.dirname(seenPath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(seenPath), 0o700);
    fs.appendFileSync(seenPath, ids.map((id) => id + "\n").join(""), { mode: 0o600 });
    fs.chmodSync(seenPath, 0o600);
  } catch (e) {
    process.stderr.write(`[live-directives] seen-file write skipped: ${(e as Error).message}\n`);
  }
}

/**
 * Render the survivors grouped by ticket via the reused renderer, with a
 * shown-sentinel emitted OUTSIDE each ticket's fenced data block (so a directive
 * body inside the fence can never forge or censor a marker).
 */
function renderSurvivors(byTicket: Map<string, Directive[]>, render: RenderDirectiveSection): string {
  const blocks: string[] = [HEADING];
  for (const [ticket, directives] of byTicket) {
    blocks.push(`### ${ticket}`);
    const lines: string[] = [];
    render({ pendingDirectives: directives, permittedLabels: [] }, lines, {});
    blocks.push(lines.join("\n"));
    for (const d of directives) blocks.push(sentinelFor(d.id));
  }
  return blocks.join("\n");
}

function groupByTicket(directives: Directive[]): Map<string, Directive[]> {
  const byTicket = new Map<string, Directive[]>();
  for (const d of directives) {
    const list = byTicket.get(d.ticket) ?? byTicket.set(d.ticket, []).get(d.ticket)!;
    list.push(d);
  }
  return byTicket;
}

async function main(): Promise<void> {
  const input = await readStdinJson();
  const cwd = typeof input.cwd === "string" ? input.cwd : "";
  if (!cwd) return;
  const sessionId = typeof input.session_id === "string" ? input.session_id : "";

  const pending = pendingDirectivesFor(cwd);
  if (!pending.length) return;

  const seenPath = seenFilePath(sessionId);
  const seen = loadSeen(input.transcript_path, seenPath);
  const survivors = pending.filter((d) => d && typeof d.id === "string" && !seen.has(d.id));
  if (!survivors.length) return;

  const render = loadRenderer();
  const text = renderSurvivors(groupByTicket(survivors), render);
  process.stdout.write(text + "\n");
  recordSeen(seenPath, survivors.map((d) => d.id));
}

/** True when this module is the process entrypoint (run directly as the hook). */
function isEntrypoint(): boolean {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isEntrypoint()) {
  main()
    .catch((e) => process.stderr.write(`[live-directives] error: ${(e as Error).message}\n`))
    .finally(() => process.exit(0)); // never block or reject a user prompt
}

export { main, seenFilePath, loadSeen, renderSurvivors, pendingDirectivesFor };
