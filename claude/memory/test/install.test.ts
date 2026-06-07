/**
 * TDD for ADT-202: idempotent hook wiring into settings.json (AC-I3/AC-I5) and
 * secret-free config building (AC-I6 / security C1). Written before impl (Red).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { wireHooks, hooksWired } from "../src/install/settings.ts";
import { buildConfig } from "../src/install/config.ts";

const OPTS = { restorePath: "/repo/claude/memory/src/hooks/restore-context.ts", savePath: "/repo/claude/memory/src/hooks/save-context.ts" };

test("wireHooks adds SessionStart + PreCompact in the correct schema", () => {
  const s = wireHooks({}, OPTS);
  const ss = s.hooks.SessionStart[0];
  assert.equal(ss.matcher, "startup|resume|compact");
  assert.equal(ss.hooks[0].type, "command");
  assert.equal(ss.hooks[0].command, "node");
  assert.deepEqual(ss.hooks[0].args, ["--no-warnings", OPTS.restorePath]);
  assert.equal(typeof ss.hooks[0].timeout, "number");
  const pc = s.hooks.PreCompact[0];
  assert.equal(pc.matcher, "");
  assert.deepEqual(pc.hooks[0].args, ["--no-warnings", OPTS.savePath]);
});

test("wireHooks is idempotent — running twice yields identical settings (AC-I5)", () => {
  const once = wireHooks({}, OPTS);
  const twice = wireHooks(once, OPTS);
  assert.deepEqual(twice, once);
  // and no duplicate hook entries
  assert.equal(twice.hooks.SessionStart.length, 1);
  assert.equal(twice.hooks.SessionStart[0].hooks.length, 1);
});

test("wireHooks preserves unrelated existing settings and other hooks (AC-I5)", () => {
  const existing = {
    permissions: { allow: ["Skill"] },
    statusLine: { type: "command", command: "echo hi" },
    hooks: {
      SessionStart: [
        { matcher: "startup", hooks: [{ type: "command", command: "other-tool" }] },
      ],
    },
  };
  const s = wireHooks(existing, OPTS);
  assert.deepEqual(s.permissions, existing.permissions);
  assert.deepEqual(s.statusLine, existing.statusLine);
  // the user's other SessionStart hook survives
  const flat = s.hooks.SessionStart.flatMap((g: any) => g.hooks.map((h: any) => h.command));
  assert.ok(flat.includes("other-tool"), "kept the user's existing hook");
  assert.ok(flat.includes("node"), "added ours");
  assert.equal(hooksWired(s, OPTS), true);
});

test("hooksWired reports false when our hooks are absent", () => {
  assert.equal(hooksWired({}, OPTS), false);
  assert.equal(hooksWired({ hooks: { SessionStart: [] } }, OPTS), false);
});

test("buildConfig writes selection only — NEVER a secret (AC-I6 / C1)", () => {
  const cfg = buildConfig({}, {
    backend: "sqlite",
    embeddings: "voyage",
    // hostile extra fields that must never be persisted:
    apiKey: "pa-SECRET-123",
    VOYAGE_API_KEY: "pa-SECRET-456",
    token: "Bearer abc",
  } as any);
  const json = JSON.stringify(cfg);
  assert.ok(!json.includes("SECRET"), "no secret material persisted");
  assert.ok(!json.includes("Bearer abc"));
  assert.equal(cfg.memory.backend, "sqlite");
  assert.equal(cfg.memory.embeddings, "voyage");
  assert.equal(cfg.memory.qdrantUrl, null);
  assert.match(cfg.memory.dbPath, /memory\.db$/);
});

test("buildConfig merges over existing config without losing overlays/hub", () => {
  const existing = { memory: { backend: "none", embeddings: "none" }, overlays: { mem0: { enabled: true } }, hub: { maxActive: 4, ws: true } };
  const cfg = buildConfig(existing, { backend: "sqlite", embeddings: "gemini" });
  assert.equal(cfg.overlays.mem0.enabled, true, "preserved an enabled overlay");
  assert.equal(cfg.hub.maxActive, 4, "preserved hub settings");
  assert.equal(cfg.memory.backend, "sqlite");
});

test("buildConfig defaults to the zero-config digest-only path", () => {
  const cfg = buildConfig({}, {});
  assert.equal(cfg.memory.backend, "none");
  assert.equal(cfg.memory.embeddings, "none");
});
