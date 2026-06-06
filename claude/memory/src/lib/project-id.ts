/**
 * Stable project identity, shared by the memory store and the hub registry so a
 * project's board and its vector rows line up.
 *
 * id = short sha1 of the canonical project root: the git top-level if the dir is
 * inside a repo, else the realpath of the dir. Path-based, so a move/rename can
 * orphan history — acceptable for now; documented as a known limitation.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

/** Resolve the canonical root for a working directory (git top-level or realpath). */
export function projectRoot(cwd: string): string {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (top) return top;
  } catch {
    // not a git repo (or git absent) — fall through
  }
  try {
    return fs.realpathSync(cwd);
  } catch {
    return cwd;
  }
}

/** Short, stable id for a project, derived from its canonical root. */
export function projectId(cwd: string): string {
  const root = projectRoot(cwd);
  return crypto.createHash("sha1").update(root).digest("hex").slice(0, 12);
}
