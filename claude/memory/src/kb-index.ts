/**
 * Build / refresh the optional full-text Knowledge index for a project.
 *
 * Resolves the project's id, its own vault dir, and the contained common vault using the
 * same rules the hub uses, then reconciles the index. Read-only over the vaults and fully
 * local — it performs no network I/O. The index lives in the user-global memory db under
 * `~/.aidevteam`, gitignored by location.
 *
 * CLI:  node src/kb-index.ts [projectDir] [--rebuild]
 */
import fs from "node:fs";
import path from "node:path";
import { KbFtsStore } from "./stores/kb-fts.ts";
import { projectId } from "./lib/project-id.ts";
import { defaultDbPath, aidevteamHome } from "./lib/paths.ts";

/** Options for {@link buildIndex}. */
export interface BuildIndexOptions {
  /** The project working directory whose vault is indexed. */
  project: string;
  /** Where the index db lives; defaults to the user-global memory db. */
  dbPath?: string;
  /** An explicit common-vault dir, or null to resolve the default `<home>/kb-common`. */
  commonVault?: string | null;
  /** The user-global home used for containment of the common vault (defaults to `~/.aidevteam`). */
  containedHome?: string;
  /** Drop and rebuild the tables before reconciling (used on suspected corruption). */
  rebuild?: boolean;
}

/** A one-line summary of a build run. */
export interface BuildIndexSummary {
  projectId: string;
  stack: string[];
  /** notes present in the project vault after the build. */
  indexed: number;
  /** notes present in the common partition after the build. */
  common: number;
}

const PROJECT_VAULT_DIRS = ["docs", "kb", path.join(".aidevteam", "kb")];

/** True only when `child` is `root` itself or strictly beneath it (sibling-prefix safe). */
function isContained(root: string, child: string): boolean {
  return child === root || child.startsWith(root + path.sep);
}

/** Resolve the first existing project vault dir, or null when none exists. */
function resolveProjectVault(project: string): string | null {
  for (const d of PROJECT_VAULT_DIRS) {
    const full = path.join(project, d);
    try {
      if (fs.statSync(full).isDirectory()) return full;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

/**
 * Resolve the common-vault dir, applying the same containment rule the hub enforces: the
 * intended root (an override, else `<home>/kb-common`) is realpath-resolved and must be
 * contained within the realpath'd user-global home. An override (or symlink) escaping the
 * home is refused, so a read can never reach files outside the user's own state.
 */
function resolveCommonVault(commonVault: string | null | undefined, home: string): string | null {
  const intended = commonVault ?? path.join(home, "kb-common");
  let real: string;
  try {
    if (!fs.existsSync(intended)) return null;
    real = fs.realpathSync(intended);
  } catch {
    return null;
  }
  let realHome: string;
  try {
    realHome = fs.realpathSync(home);
  } catch {
    return null;
  }
  return isContained(realHome, real) ? real : null;
}

/**
 * Reconcile the full-text index for one project. Returns a summary, or null when the db
 * cannot be opened (the caller degrades to the file scan). Read-only over the vaults.
 */
export async function buildIndex(opts: BuildIndexOptions): Promise<BuildIndexSummary | null> {
  const project = path.resolve(opts.project);
  const dbPath = opts.dbPath ?? defaultDbPath();
  const home = opts.containedHome ?? aidevteamHome();

  const store = await KbFtsStore.open(dbPath);
  if (!store) return null;
  try {
    store.ensureSchema();
    if (opts.rebuild) store.rebuild();

    const pid = projectId(project);
    const stack = detectStack(project);
    const projectVault = resolveProjectVault(project);
    const commonVault = resolveCommonVault(opts.commonVault, home);

    store.syncVaults(pid, projectVault ?? path.join(project, "__no_vault__"), commonVault ?? path.join(home, "__no_common__"), stack);

    return {
      projectId: pid,
      stack,
      indexed: store.countScope(pid, "project"),
      common: store.countScope("", "common"),
    };
  } finally {
    store.close();
  }
}

const STACK_MARKERS: Array<[string, string]> = [
  ["package.json", "node"],
  ["tsconfig.json", "typescript"],
  ["pyproject.toml", "python"],
  ["requirements.txt", "python"],
  ["Cargo.toml", "rust"],
  ["go.mod", "go"],
  ["pom.xml", "java"],
  ["build.gradle", "java"],
  ["build.gradle.kts", "kotlin"],
  ["Gemfile", "ruby"],
  ["composer.json", "php"],
];

/** Bounded, never-throwing stack detection mirroring the hub's marker set. */
function detectStack(root: string): string[] {
  const found = new Set<string>();
  for (const [marker, label] of STACK_MARKERS) {
    try {
      if (fs.existsSync(path.join(root, marker))) found.add(label);
    } catch {
      /* skip */
    }
  }
  const out = [...found].sort();
  return out.length ? out : ["any"];
}

// ---- CLI -------------------------------------------------------------------
function isMain(): boolean {
  return import.meta.url === `file://${process.argv[1]}`;
}
if (isMain()) {
  const args = process.argv.slice(2);
  const rebuild = args.includes("--rebuild");
  const dir = path.resolve(args.find((a) => !a.startsWith("-")) ?? process.cwd());
  buildIndex({ project: dir, rebuild }).then((s) => {
    if (!s) {
      process.stdout.write("kb-index: index unavailable (db could not be opened)\n");
      process.exit(1);
    }
    process.stdout.write(`kb-index: project ${s.projectId} [${s.stack.join(",")}] — ${s.indexed} project, ${s.common} common\n`);
  });
}
