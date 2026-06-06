/**
 * Read the user-global memory config (~/.aidevteam/config.json).
 *
 * The config carries the *choice* of backend/embeddings only — never secrets.
 * API keys are always read from the environment. Missing/invalid config →
 * sensible defaults (digest-only: no vectors, no keys), so memory never blocks.
 */
import fs from "node:fs";
import type { MemoryConfig } from "../types.ts";
import { configPath, defaultDbPath, expandHome } from "./paths.ts";

const DEFAULTS: MemoryConfig = {
  backend: "none",
  embeddings: "none",
  dbPath: defaultDbPath(),
  qdrantUrl: null,
};

export function loadMemoryConfig(): MemoryConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return { ...DEFAULTS };
  }
  const mem = (raw as { memory?: Partial<MemoryConfig> })?.memory ?? {};
  const cfg: MemoryConfig = {
    backend: pick(mem.backend, ["none", "sqlite", "qdrant"], DEFAULTS.backend),
    embeddings: pick(mem.embeddings, ["none", "voyage", "gemini"], DEFAULTS.embeddings),
    dbPath: typeof mem.dbPath === "string" && mem.dbPath ? expandHome(mem.dbPath) : DEFAULTS.dbPath,
    qdrantUrl: typeof mem.qdrantUrl === "string" && mem.qdrantUrl ? mem.qdrantUrl : null,
  };
  return cfg;
}

function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;
}
