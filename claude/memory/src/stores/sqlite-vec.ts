/**
 * Default vector backend: SQLite + the sqlite-vec extension via Node's built-in
 * `node:sqlite`. No Docker, single file, scales across projects.
 *
 * Security:
 *  - C8: the extension is loaded ONLY from the vendored package path
 *    (`sqlite-vec.getLoadablePath()`), never a user/env-supplied path, and
 *    extension loading is disabled again immediately after load.
 *  - C11: the DB file is created 0600 under a 0700 dir (handled by the caller).
 *
 * Each collection is one vec0 virtual table with metadata columns (filterable in
 * the KNN query) and `+content`/`+payload` auxiliary columns (stored, returned).
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Filters, ScoredPoint, VectorPoint, VectorStore } from "../types.ts";
import { COLLECTIONS } from "./collections.ts";

export class SqliteVecStore implements VectorStore {
  #db: DatabaseSync;
  dims = 0;

  private constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Open the DB and load sqlite-vec. Returns null if the extension is unavailable. */
  static async open(dbPath: string): Promise<SqliteVecStore | null> {
    let loadablePath: string;
    try {
      const mod = (await import("sqlite-vec")) as { getLoadablePath(): string };
      loadablePath = mod.getLoadablePath();
    } catch {
      return null; // optional dep not installed → caller degrades to digest-only
    }
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
      const db = new DatabaseSync(dbPath, { allowExtension: true });
      db.enableLoadExtension(true);
      db.loadExtension(loadablePath); // C8: vendored path only
      db.enableLoadExtension(false); // C8: re-disable immediately
      db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
      try {
        fs.chmodSync(dbPath, 0o600); // C11
      } catch {
        /* best-effort */
      }
      return new SqliteVecStore(db);
    } catch {
      return null;
    }
  }

  async ensureCollections(dims: number): Promise<Record<string, boolean>> {
    this.dims = dims;
    this.#db.exec("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)");
    const stored = this.#getMeta("embedding_dims");
    if (stored && Number(stored) !== dims) {
      // C-dim: refuse to mix vector widths in one DB.
      throw new Error(`embedding dims mismatch: db=${stored} requested=${dims} (reindex required)`);
    }
    if (!stored) this.#setMeta("embedding_dims", String(dims));
    const result: Record<string, boolean> = {};
    for (const c of COLLECTIONS) {
      const before = this.#tableExists(vecTable(c));
      this.#db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${vecTable(c)} USING vec0(
           id TEXT PRIMARY KEY,
           embedding float[${dims}] distance_metric=cosine,
           project_id TEXT,
           scope TEXT,
           chunk_type TEXT,
           session_id TEXT,
           +content TEXT,
           +payload TEXT
         )`,
      );
      result[c] = !before;
    }
    return result;
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    if (!points.length) return;
    const stmt = this.#db.prepare(
      `INSERT OR REPLACE INTO ${vecTable(collection)}
         (id, embedding, project_id, scope, chunk_type, session_id, content, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.#db.exec("BEGIN");
    try {
      for (const p of points) {
        const pl = p.payload;
        stmt.run(
          p.id,
          JSON.stringify(p.vector),
          str(pl.project_id),
          str(pl.scope),
          str(pl.chunk_type),
          str(pl.session_id),
          str(pl.content),
          JSON.stringify(pl),
        );
      }
      this.#db.exec("COMMIT");
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    }
  }

  async query(
    collection: string,
    vector: number[],
    filters: Filters | null,
    limit: number,
  ): Promise<ScoredPoint[]> {
    const where: string[] = ["embedding MATCH ?", "k = ?"];
    const params: Array<string | number> = [JSON.stringify(vector), limit];
    for (const [k, v] of Object.entries(filters ?? {})) {
      if (["project_id", "scope", "chunk_type", "session_id"].includes(k)) {
        where.push(`${k} = ?`);
        params.push(v as string);
      }
    }
    const rows = this.#db
      .prepare(
        `SELECT id, payload, distance FROM ${vecTable(collection)}
         WHERE ${where.join(" AND ")} ORDER BY distance`,
      )
      .all(...params) as Array<{ id: string; payload: string; distance: number }>;
    return rows.map((r) => ({
      id: r.id,
      score: 1 - r.distance, // cosine distance → similarity
      payload: safeParse(r.payload),
    }));
  }

  async scroll(collection: string, filters: Filters | null, limit: number): Promise<ScoredPoint[]> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    for (const [k, v] of Object.entries(filters ?? {})) {
      if (["project_id", "scope", "chunk_type", "session_id"].includes(k)) {
        where.push(`${k} = ?`);
        params.push(v as string);
      }
    }
    const sql = `SELECT id, payload FROM ${vecTable(collection)}${
      where.length ? " WHERE " + where.join(" AND ") : ""
    } LIMIT ?`;
    params.push(limit);
    const rows = this.#db.prepare(sql).all(...params) as Array<{ id: string; payload: string }>;
    return rows.map((r) => ({ id: r.id, score: 0, payload: safeParse(r.payload) }));
  }

  async health(): Promise<boolean> {
    try {
      this.#db.prepare("SELECT vec_version()").get();
      return true;
    } catch {
      return false;
    }
  }

  async stats(): Promise<Array<{ name: string; exists: boolean; points: number }>> {
    return COLLECTIONS.map((c) => {
      try {
        const row = this.#db.prepare(`SELECT count(*) AS n FROM ${vecTable(c)}`).get() as { n: number };
        return { name: c, exists: true, points: row.n };
      } catch {
        return { name: c, exists: false, points: 0 };
      }
    });
  }

  close(): void {
    try {
      this.#db.close();
    } catch {
      /* ignore */
    }
  }

  #tableExists(name: string): boolean {
    const row = this.#db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
      .get(name);
    return !!row;
  }
  #getMeta(key: string): string | null {
    const row = this.#db.prepare("SELECT value FROM _meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }
  #setMeta(key: string, value: string): void {
    this.#db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)").run(key, value);
  }
}

/** Map a collection name to a safe SQL table name (hyphens are illegal unquoted). */
const vecTable = (c: string): string => `vec_${c.replace(/-/g, "_")}`;
const str = (v: unknown): string => (v == null ? "" : String(v));
function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
