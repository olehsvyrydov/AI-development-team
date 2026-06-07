#!/usr/bin/env node
/**
 * Interactive memory setup wizard.
 *
 * Persists the user's choice to ~/.aidevteam/config.json (selection only, 0600)
 * and idempotently wires the SessionStart/PreCompact hooks into
 * ~/.claude/settings.json. Every question defaults to the zero-config, no-key,
 * no-Docker path (digest-only), which still injects workflow state every session.
 *
 * Usage:
 *   node wizard.ts                      # interactive
 *   node wizard.ts --yes                # accept defaults (digest-only), wire hooks
 *   node wizard.ts --backend sqlite --embeddings gemini
 *   node wizard.ts --no-hooks           # write config but don't wire hooks
 *   node wizard.ts --add-overlay mem0   # connect an MCP overlay later (no reinstall)
 *   node wizard.ts --status             # show current config + whether hooks are wired
 *   node wizard.ts --settings <path>    # target a specific settings.json (tests/CI)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { configPath, aidevteamHome } from "../lib/paths.ts";
import { buildConfig, setOverlay, type AidtConfig, type ExistingConfig, type InstallChoices } from "./config.ts";
import { wireHooks, unwireHooks, hooksWired, type WireOpts } from "./settings.ts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RESTORE = path.resolve(HERE, "../hooks/restore-context.ts");
const SAVE = path.resolve(HERE, "../hooks/save-context.ts");

function args(): Record<string, string | boolean> {
  const a = process.argv.slice(2);
  const o: Record<string, string | boolean> = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const key = a[i].slice(2);
    const next = a[i + 1];
    if (next && !next.startsWith("--")) {
      o[key] = next;
      i++;
    } else o[key] = true;
  }
  return o;
}

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Write JSON atomically with restrictive perms. */
function writeJson(p: string, obj: unknown, mode: number): void {
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", { mode });
  fs.renameSync(tmp, p);
  try {
    fs.chmodSync(p, mode);
  } catch {
    /* best-effort */
  }
}

function wireOpts(settingsPath: string): WireOpts & { settingsPath: string } {
  return { restorePath: RESTORE, savePath: SAVE, settingsPath };
}

function settingsTarget(o: Record<string, string | boolean>): string {
  return typeof o.settings === "string"
    ? o.settings
    : path.join(os.homedir(), ".claude", "settings.json");
}

function disclose(embeddings: string): void {
  if (embeddings === "none") return;
  process.stdout.write(
    `\n  ⚠  Embeddings are ENABLED (${embeddings}). On compaction, project-derived text\n` +
      `     (decisions, file changes, discussions) is sent to the ${embeddings} API to be embedded.\n` +
      `     Secrets are scrubbed first and credential files are skipped, but treat this as\n` +
      `     egress of your project content. The API key is read from the environment only\n` +
      `     and is never written to config. Choose "none" to keep everything local (digest-only).\n`,
  );
}

function summary(cfg: AidtConfig, wired: boolean, settingsPath: string): void {
  process.stdout.write(
    `\n✓ Memory configured → ${configPath()}\n` +
      `    backend:    ${cfg.memory.backend}\n` +
      `    embeddings: ${cfg.memory.embeddings}\n` +
      `    hooks:      ${wired ? "wired into " + settingsPath : "NOT wired"}\n` +
      `\nImprove memory later (no reinstall):\n` +
      `  • enable a vector backend:  node ${path.relative(process.cwd(), path.resolve(HERE, "wizard.ts"))} --backend sqlite --embeddings gemini\n` +
      `  • connect an MCP overlay:   node ${path.relative(process.cwd(), path.resolve(HERE, "wizard.ts"))} --add-overlay mem0\n` +
      `  • wire hooks later:         node ${path.relative(process.cwd(), path.resolve(HERE, "wizard.ts"))} --yes\n`,
  );
}

async function interactive(): Promise<InstallChoices & { wireHooks: boolean }> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, def: string): Promise<string> =>
    (await rl.question(`${q} [${def}]: `)).trim() || def;
  try {
    process.stdout.write("\nAI Dev Team — memory setup\n");
    process.stdout.write("How should sessions remember your projects?\n");
    process.stdout.write("  1) none    — deterministic workflow digest only (no vectors, no keys) [recommended]\n");
    process.stdout.write("  2) sqlite  — local vector store, no Docker\n");
    process.stdout.write("  3) qdrant  — existing Qdrant server\n");
    const b = await ask("Choose memory backend (1/2/3)", "1");
    const backend = b === "2" ? "sqlite" : b === "3" ? "qdrant" : "none";
    let embeddings: InstallChoices["embeddings"] = "none";
    if (backend !== "none") {
      process.stdout.write("Embeddings provider:\n  1) none (store later)  2) voyage  3) gemini\n");
      const e = await ask("Choose embeddings (1/2/3)", "1");
      embeddings = e === "2" ? "voyage" : e === "3" ? "gemini" : "none";
      disclose(embeddings!);
    }
    const wire = (await ask("Wire session hooks now? (y/n)", "y")).toLowerCase().startsWith("y");
    return { backend, embeddings, wireHooks: wire };
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const o = args();
  const settingsPath = settingsTarget(o);
  const opts = wireOpts(settingsPath);
  const existingCfg = readJson<ExistingConfig>(configPath(), {});

  // --status: report and exit
  if (o.status) {
    const settings = readJson<Record<string, unknown>>(settingsPath, {});
    process.stdout.write(
      `config: ${configPath()}\n${JSON.stringify(existingCfg, null, 2)}\n` +
        `hooks wired: ${hooksWired(settings, opts)}\n`,
    );
    return;
  }

  // --add-overlay / --disable-overlay: the "connect later" path
  if (typeof o["add-overlay"] === "string" || typeof o["disable-overlay"] === "string") {
    const base = buildConfig(existingCfg, {});
    const enable = typeof o["add-overlay"] === "string";
    const name = String(o["add-overlay"] ?? o["disable-overlay"]);
    const cfg = setOverlay(base, name, enable);
    writeJson(configPath(), cfg, 0o600);
    process.stdout.write(`✓ overlay '${name}' ${enable ? "enabled" : "disabled"} in ${configPath()}\n`);
    if (enable)
      process.stdout.write(
        `  Next: copy claude/workflow/adapters/mcp/${name}.json into your .mcp.json to activate it.\n`,
      );
    return;
  }

  // Gather choices: flags/--yes (non-interactive) or interactive prompts.
  let choices: InstallChoices & { wireHooks: boolean };
  if (o.yes || o.backend || o.embeddings || o["no-hooks"]) {
    const embeddings = (o.embeddings as InstallChoices["embeddings"]) ?? "none";
    choices = {
      backend: (o.backend as InstallChoices["backend"]) ?? "none",
      embeddings,
      qdrantUrl: typeof o["qdrant-url"] === "string" ? o["qdrant-url"] : undefined,
      wireHooks: !o["no-hooks"],
    };
    disclose(embeddings ?? "none");
  } else {
    choices = await interactive();
  }

  const cfg = buildConfig(existingCfg, choices);
  writeJson(configPath(), cfg, 0o600);
  try {
    fs.chmodSync(aidevteamHome(), 0o700);
  } catch {
    /* best-effort */
  }

  let wired = false;
  if (choices.wireHooks) {
    const settings = readJson<Record<string, unknown>>(settingsPath, {});
    writeJson(settingsPath, wireHooks(settings, opts), 0o600);
    wired = true;
  }
  summary(cfg, wired, settingsPath);
}

main().catch((e) => {
  process.stderr.write(`memory setup error: ${(e as Error).message}\n`);
  process.exit(1);
});

export { unwireHooks }; // re-exported for the uninstall path
