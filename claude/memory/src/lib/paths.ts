/** Canonical filesystem locations for the user-global AI Dev Team state. */
import os from "node:os";
import path from "node:path";

/** ~/.aidevteam — the user-global state root (config, registry, memory db). */
export function aidevteamHome(): string {
  return path.join(os.homedir(), ".aidevteam");
}

export function configPath(): string {
  return path.join(aidevteamHome(), "config.json");
}

export function defaultDbPath(): string {
  return path.join(aidevteamHome(), "memory", "memory.db");
}

/** Expand a leading ~ to the home directory. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}
