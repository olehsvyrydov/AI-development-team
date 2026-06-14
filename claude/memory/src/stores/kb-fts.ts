/**
 * Optional lexical (full-text) index over Knowledge note bodies.
 *
 * This is a derived, rebuildable accelerator — never a source of truth. The markdown
 * vault files remain canonical; this index only re-ranks search over text already
 * visible by the file scan. It reuses the established `node:sqlite` posture: the db is
 * created 0600 under a 0700 dir, opened in WAL with a bounded busy timeout, and loads
 * NO extension (FTS5 is built into SQLite). Visibility is decided by the SHARED scope
 * predicate (`lib/knowledge-match.ts scopeMatches`), the single authority mirrored to
 * the hub — the SQL filter is only ever a narrowing candidate generator, never a second
 * scope authority that could widen reach.
 *
 * Security:
 *  - the full-text query reaches SQL ONLY as a bound `MATCH` parameter (never string
 *    interpolation), and is sanitized to plain terms so FTS operator syntax cannot
 *    error or alter the statement;
 *  - every indexed file is realpath-contained to its vault root before it is read, so a
 *    symlink escaping the vault is skipped, not followed;
 *  - the indexer is read-only over the vaults — it writes only its own db.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { reduceBody } from "../lib/note-body.ts";
import { scopeMatches } from "../lib/knowledge-match.ts";

/** The schema revision; a stored mismatch drops and rebuilds the tables (it is a cache). */
const SCHEMA_VERSION = 1;

/** Partition id for the shared common vault: one row per file, not duplicated per project. */
const COMMON_PARTITION = "";

/** Holding-vault scope of an indexed note. */
export type NoteScope = "project" | "common";

/** A scoped full-text query against the index. */
export interface KbFtsQuery {
  /** The querying project's stable id (rows with this id are its own project notes). */
  projectId: string;
  /** The querying project's declared stack, used by the common-stack predicate. */
  projectStack: string[];
  /** Restrict to a scope, or 'all' for both. */
  scope: NoteScope | "all";
  /** The raw user query text (bound + sanitized before it reaches SQL). */
  query: string;
  /** Maximum hits to return. */
  limit: number;
}

/** A ranked hit. `file` is the note filename within its vault; `score` is higher-is-better. */
export interface KbFtsHit {
  file: string;
  scope: NoteScope;
  score: number;
}

interface NoteRow {
  rowid: number;
  project_id: string;
  scope: NoteScope;
  status: string | null;
  stack: string | null;
  file: string;
}

/**
 * Owns the lifecycle of the `kb_note` + `kb_fts` tables inside the shared memory db.
 * Open with {@link KbFtsStore.open}; it returns `null` on any failure so callers degrade.
 */
export class KbFtsStore {
  #db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * Open (creating if needed) the db at `dbPath`, hardened 0600 under a 0700 dir, in
   * WAL with a bounded busy timeout. Loads no extension. Returns `null` on any failure
   * so a caller silently falls back to the file scan.
   */
  static async open(dbPath: string): Promise<KbFtsStore | null> {
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
      try {
        fs.chmodSync(dbPath, 0o600);
      } catch {
        /* best-effort on platforms without POSIX modes */
      }
      return new KbFtsStore(db);
    } catch {
      return null;
    }
  }

  /**
   * Create the metadata + full-text tables if absent; if a stored schema version
   * disagrees with this build, drop and recreate them (the index is a cache).
   */
  ensureSchema(): void {
    this.#db.exec("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)");
    const stored = this.#getMeta("kb_fts_schema");
    if (stored && Number(stored) !== SCHEMA_VERSION) {
      this.#db.exec("DROP TABLE IF EXISTS kb_fts; DROP TABLE IF EXISTS kb_note;");
    }
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS kb_note (
        rowid      INTEGER PRIMARY KEY,
        project_id TEXT NOT NULL,
        path       TEXT NOT NULL,
        mtime_ms   REAL NOT NULL,
        size       INTEGER NOT NULL,
        scope      TEXT NOT NULL,
        status     TEXT,
        stack      TEXT,
        kind       TEXT,
        title      TEXT,
        file       TEXT NOT NULL,
        UNIQUE(project_id, path)
      )`);
    this.#db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
        body,
        title,
        tokenize='unicode61 remove_diacritics 2'
      )`);
    this.#setMeta("kb_fts_schema", String(SCHEMA_VERSION));
  }

  /** The schema version currently recorded in the db (or 0 when unset). */
  schemaVersion(): number {
    return Number(this.#getMeta("kb_fts_schema") ?? 0);
  }

  /** Drop both tables and recreate empty ones — a full rebuild of the cache. */
  rebuild(): void {
    this.#db.exec("DROP TABLE IF EXISTS kb_fts; DROP TABLE IF EXISTS kb_note;");
    this.ensureSchema();
  }

  /** Count indexed rows in one partition with the given scope. */
  countScope(partitionId: string, scope: NoteScope): number {
    try {
      const row = this.#db
        .prepare("SELECT count(*) AS n FROM kb_note WHERE project_id = ? AND scope = ?")
        .get(partitionId, scope) as { n: number };
      return row.n;
    } catch {
      return 0;
    }
  }

  /**
   * Reconcile the index for one project from its vault dirs. Project-scoped notes are
   * read from `projectVault`; common notes from `commonVault`. The HOLDING VAULT decides
   * each row's scope (front-matter is intent only). Idempotent: a note whose
   * path|mtime|size is unchanged is skipped; a changed note is re-indexed; a row whose
   * file no longer lives in its vault (deleted or moved to `.trash`) is dropped.
   *
   * Every candidate file is realpath-contained to its vault root before being read, so a
   * symlink escaping the vault is skipped. Read-only over the vaults — writes only the db.
   *
   * @param projectId the querying project's stable id (also the partition key for its rows)
   * @param projectVault absolute path to the project's own vault dir
   * @param commonVault absolute path to the shared common vault dir
   * @param projectStack the project's declared stack (unused at index time; scope is by vault)
   */
  syncVaults(projectId: string, projectVault: string, commonVault: string, _projectStack: string[]): void {
    this.#db.exec("BEGIN");
    try {
      this.#reconcilePartition(projectId, projectVault, "project");
      this.#reconcilePartition(COMMON_PARTITION, commonVault, "common");
      this.#db.exec("COMMIT");
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * Reconcile one db partition against one vault. Project notes are partitioned by the
   * project's id; common notes share a single partition (one row per shared file, never
   * duplicated per querying project). A changed file is re-indexed; a row whose file no
   * longer lives in the vault (deleted or moved to `.trash`) is dropped.
   */
  #reconcilePartition(partitionId: string, vaultDir: string, scope: NoteScope): void {
    const live = new Map<string, { mtimeMs: number; size: number; scope: NoteScope; raw: string }>();
    this.#collect(vaultDir, scope, live);

    const existing = this.#db
      .prepare("SELECT rowid, path, mtime_ms, size FROM kb_note WHERE project_id = ? AND scope = ?")
      .all(partitionId, scope) as Array<{ rowid: number; path: string; mtime_ms: number; size: number }>;
    const existingByPath = new Map(existing.map((r) => [r.path, r]));

    for (const [absPath, info] of live) {
      const prior = existingByPath.get(absPath);
      if (prior && prior.mtime_ms === info.mtimeMs && prior.size === info.size) continue;
      if (prior) this.#deleteRow(prior.rowid);
      this.#insert(partitionId, absPath, info);
    }
    for (const [absPath, prior] of existingByPath) {
      if (!live.has(absPath)) this.#deleteRow(prior.rowid);
    }
  }

  /**
   * Search the index for one project. The SQL prefilter is a NARROWING candidate
   * generator only (own project rows, or approved-common rows); every candidate is then
   * passed through the shared `scopeMatches` as the FINAL authority before it is
   * returned, so the index can only ever HIDE a visible note, never reveal one.
   */
  search(q: KbFtsQuery): KbFtsHit[] {
    const matchExpr = sanitizeMatch(q.query);
    if (!matchExpr) return [];

    const scopes: NoteScope[] = q.scope === "all" ? ["project", "common"] : [q.scope];
    const where: string[] = ["kb_fts MATCH ?"];
    const params: Array<string | number> = [matchExpr];

    const scopeClauses: string[] = [];
    if (scopes.includes("project")) {
      scopeClauses.push("(n.scope = 'project' AND n.project_id = ?)");
      params.push(q.projectId);
    }
    if (scopes.includes("common")) {
      scopeClauses.push("(n.scope = 'common' AND n.status = 'approved-common')");
    }
    if (!scopeClauses.length) return [];
    where.push(`(${scopeClauses.join(" OR ")})`);

    params.push(q.limit);
    let rows: Array<NoteRow & { score: number }>;
    try {
      rows = this.#db
        .prepare(
          `SELECT n.rowid AS rowid, n.project_id AS project_id, n.scope AS scope,
                  n.status AS status, n.stack AS stack, n.file AS file,
                  bm25(kb_fts) AS rank
             FROM kb_fts JOIN kb_note n ON n.rowid = kb_fts.rowid
            WHERE ${where.join(" AND ")}
            ORDER BY rank
            LIMIT ?`,
        )
        .all(...params)
        .map((r) => {
          const row = r as unknown as NoteRow & { rank: number };
          return { ...row, score: -row.rank };
        });
    } catch {
      return [];
    }

    const projectMeta = { stack: q.projectStack };
    const out: KbFtsHit[] = [];
    for (const r of rows) {
      const doc = {
        scope: r.scope,
        status: r.status ?? undefined,
        stack: parseStack(r.stack),
        ownProject: r.scope === "project" && r.project_id === q.projectId,
      };
      if (!scopeMatches(doc, projectMeta)) continue;
      out.push({ file: r.file, scope: r.scope, score: r.score });
    }
    return out;
  }

  /** Close the underlying db handle. Never throws. */
  close(): void {
    try {
      this.#db.close();
    } catch {
      /* ignore */
    }
  }

  #collect(
    vaultDir: string,
    scope: NoteScope,
    out: Map<string, { mtimeMs: number; size: number; scope: NoteScope; raw: string }>,
  ): void {
    let vaultRoot: string;
    try {
      vaultRoot = fs.realpathSync(vaultDir);
    } catch {
      return;
    }
    let names: string[];
    try {
      names = fs.readdirSync(vaultDir).filter((f) => f.endsWith(".md"));
    } catch {
      return;
    }
    for (const name of names) {
      const candidate = path.join(vaultDir, name);
      let real: string;
      try {
        real = fs.realpathSync(candidate);
      } catch {
        continue;
      }
      if (!isContained(vaultRoot, real)) continue; // an escaping symlink is skipped, not followed
      let st: fs.Stats;
      let raw: string;
      try {
        st = fs.statSync(real);
        if (!st.isFile()) continue;
        raw = fs.readFileSync(real, "utf8");
      } catch {
        continue;
      }
      out.set(candidate, { mtimeMs: st.mtimeMs, size: st.size, scope, raw });
    }
  }

  #insert(
    projectId: string,
    absPath: string,
    info: { mtimeMs: number; size: number; scope: NoteScope; raw: string },
  ): void {
    const fm = parseFrontMatter(info.raw);
    const file = path.basename(absPath);
    const title = file.replace(/\.md$/, "");
    const status = clampStatus(info.scope, fm.status);
    const body = reduceBody(info.raw);
    const res = this.#db
      .prepare(
        `INSERT INTO kb_note (project_id, path, mtime_ms, size, scope, status, stack, kind, title, file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(projectId, absPath, info.mtimeMs, info.size, info.scope, status, JSON.stringify(fm.stack), fm.kind, title, file);
    const rowid = Number(res.lastInsertRowid);
    this.#db.prepare("INSERT INTO kb_fts (rowid, body, title) VALUES (?, ?, ?)").run(rowid, body, title);
  }

  #deleteRow(rowid: number): void {
    this.#db.prepare("DELETE FROM kb_fts WHERE rowid = ?").run(rowid);
    this.#db.prepare("DELETE FROM kb_note WHERE rowid = ?").run(rowid);
  }

  #getMeta(key: string): string | null {
    try {
      const row = this.#db.prepare("SELECT value FROM _meta WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? null;
    } catch {
      return null;
    }
  }

  #setMeta(key: string, value: string): void {
    this.#db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)").run(key, value);
  }
}

/** True only when `child` is `root` itself or lies strictly beneath it (sibling-prefix safe). */
function isContained(root: string, child: string): boolean {
  return child === root || child.startsWith(root + path.sep);
}

/**
 * Reduce a raw user query to a safe FTS5 `MATCH` expression: each alphanumeric run
 * becomes a quoted term and the terms are OR-combined. All FTS operator/syntax
 * characters are stripped, so the bound parameter can never alter the statement or
 * raise a malformed-query error. Returns `''` when nothing usable remains.
 */
export function sanitizeMatch(query: string): string {
  const terms = String(query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0)
    .slice(0, 16);
  if (!terms.length) return "";
  return terms.map((t) => `"${t}"`).join(" OR ");
}

interface FrontMatter {
  scope: NoteScope;
  status: string | null;
  stack: string[];
  kind: string | null;
}

const SCOPES = new Set<NoteScope>(["project", "common"]);
const KINDS = new Set(["pattern", "style", "rule", "context"]);
const STATUSES = new Set(["approved-project", "approved-common", "pending", "rejected"]);

/**
 * A bounded, never-throwing front-matter reader matching the hub's vocabulary: only the
 * scope/status/stack/kind keys, closed vocabularies, `global`→`common`. The result is
 * intent only — the holding vault, applied by the caller, decides the authoritative scope.
 */
function parseFrontMatter(raw: string): FrontMatter {
  const out: FrontMatter = { scope: "project", status: null, stack: ["any"], kind: null };
  try {
    const m = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return out;
    const seen: Record<string, string> = {};
    for (const line of m[1].split("\n")) {
      const lm = line.match(/^([A-Za-z_][A-Za-z0-9_]*):(.*)$/);
      if (!lm) continue;
      seen[lm[1]] = lm[2].trim();
    }
    if (typeof seen.scope === "string") {
      const sc = seen.scope.toLowerCase().trim();
      if (sc === "global") out.scope = "common";
      else if (SCOPES.has(sc as NoteScope)) out.scope = sc as NoteScope;
    }
    if (typeof seen.status === "string") {
      const st = seen.status.toLowerCase().trim();
      if (STATUSES.has(st)) out.status = st;
    }
    if (typeof seen.kind === "string") {
      const kd = seen.kind.toLowerCase().trim();
      if (KINDS.has(kd)) out.kind = kd;
    }
    if (typeof seen.stack === "string") out.stack = parseStackValue(seen.stack);
  } catch {
    return { scope: "project", status: null, stack: ["any"], kind: null };
  }
  return out;
}

function parseStackValue(s: string): string[] {
  const t = s.trim();
  let items: string[];
  if (t.startsWith("[")) {
    const close = t.lastIndexOf("]");
    items = close < 0 ? [] : t.slice(1, close).split(",").map((x) => x.trim().replace(/^["']|["']$/g, ""));
  } else {
    items = [t.replace(/^["']|["']$/g, "")];
  }
  const out = items.map((x) => x.toLowerCase().trim()).filter((x) => x.length > 0);
  return out.length ? out : ["any"];
}

function parseStack(raw: string | null): string[] {
  if (!raw) return ["any"];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? v.map(String) : ["any"];
  } catch {
    return ["any"];
  }
}

/**
 * Clamp a note's status to its holding vault, mirroring the hub's `readVault`: a common
 * note keeps `approved-common` only when it says so; a project note is `approved-project`
 * unless it is an explicit pending/rejected/approved-project state.
 */
function clampStatus(scope: NoteScope, status: string | null): string {
  if (scope === "common") return status === "approved-common" ? "approved-common" : status ?? "pending";
  if (status === "approved-project" || status === "pending" || status === "rejected") return status;
  return "approved-project";
}
