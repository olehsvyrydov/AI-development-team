/**
 * Build the user-global config object (~/.aidevteam/config.json).
 *
 * SECURITY (C1 / AC-I6): this is the ONLY thing written, and it carries the
 * *selection* only. The output object is constructed field-by-field from an
 * allowlist — never spread from caller input — so a stray key/token in the
 * `choices` argument can never be persisted.
 */
import { defaultDbPath, expandHome } from "../lib/paths.ts";

export interface InstallChoices {
  backend?: "none" | "sqlite" | "qdrant";
  embeddings?: "none" | "voyage" | "gemini";
  dbPath?: string;
  qdrantUrl?: string;
}

interface OverlayState {
  enabled: boolean;
}
export interface AidtConfig {
  version: number;
  memory: { backend: string; embeddings: string; dbPath: string; qdrantUrl: string | null };
  overlays: Record<string, OverlayState>;
  hub: { maxActive: number; ws: boolean };
}

const DEFAULT_OVERLAYS = (): Record<string, OverlayState> => ({
  mem0: { enabled: false },
  openmemory: { enabled: false },
  obsidian: { enabled: false },
});

/** Existing on-disk config is untyped input — accept a deeply-partial shape. */
export interface ExistingConfig {
  memory?: Partial<AidtConfig["memory"]>;
  overlays?: Record<string, OverlayState>;
  hub?: AidtConfig["hub"];
}

export function buildConfig(existing: ExistingConfig | null | undefined, choices: InstallChoices): AidtConfig {
  const prev = existing ?? {};
  const backend = pick(choices.backend, ["none", "sqlite", "qdrant"], "none");
  const embeddings = pick(choices.embeddings, ["none", "voyage", "gemini"], "none");
  return {
    version: 1,
    memory: {
      backend,
      embeddings,
      // allowlisted scalars only — no secrets
      dbPath: choices.dbPath ? expandHome(choices.dbPath) : prev.memory?.dbPath ?? defaultDbPath(),
      qdrantUrl: choices.qdrantUrl ?? prev.memory?.qdrantUrl ?? null,
    },
    overlays: prev.overlays && Object.keys(prev.overlays).length ? prev.overlays : DEFAULT_OVERLAYS(),
    hub: prev.hub ?? { maxActive: 8, ws: false },
  };
}

/** Toggle a memory MCP overlay (the "connect later" path, AC-I4). */
export function setOverlay(cfg: AidtConfig, name: string, enabled: boolean): AidtConfig {
  return { ...cfg, overlays: { ...cfg.overlays, [name]: { enabled } } };
}

function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;
}
