/**
 * The indexer CLI builds the index for a project from its resolved vaults and is
 * read-only over those vaults. These tests drive the exported builder directly (the
 * CLI's body) over a temp project + temp home, asserting it indexes the project vault,
 * never escapes the common vault via an override outside the home, makes the indexed
 * content queryable, and performs no outbound network I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIndex } from "../src/kb-index.ts";
import { KbFtsStore } from "../src/stores/kb-fts.ts";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aidt-kbidx-"));
}

test("buildIndex indexes the project vault and makes it queryable", async () => {
  const dir = tmp();
  try {
    const project = path.join(dir, "project");
    const docs = path.join(project, "docs");
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, "alpha.md"), "---\nscope: project\n---\n# Alpha\n\nfindme content\n");
    const dbPath = path.join(dir, "home", ".aidevteam", "memory", "memory.db");

    const summary = await buildIndex({ project, dbPath, commonVault: null });
    assert.ok(summary, "build returns a summary");
    assert.ok(summary!.indexed >= 1, "at least one note indexed");

    const store = await KbFtsStore.open(dbPath);
    store!.ensureSchema();
    const hits = store!.search({ projectId: summary!.projectId, projectStack: summary!.stack, scope: "project", query: "findme", limit: 10 });
    assert.equal(hits.length, 1, "the indexed note is queryable");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a common vault override outside the contained home indexes no common rows", async () => {
  const dir = tmp();
  try {
    const project = path.join(dir, "project");
    fs.mkdirSync(path.join(project, "docs"), { recursive: true });
    // an "escaping" common vault, well outside any ~/.aidevteam home
    const rogue = path.join(dir, "rogue-common");
    fs.mkdirSync(rogue, { recursive: true });
    fs.writeFileSync(path.join(rogue, "leak.md"), "---\nscope: common\nstatus: approved-common\nstack: [any]\n---\n# leak\n\nleak content\n");
    const dbPath = path.join(dir, "home", ".aidevteam", "memory", "memory.db");

    // an override is honored only when contained in ~/.aidevteam; this one is not.
    const summary = await buildIndex({ project, dbPath, commonVault: rogue, containedHome: path.join(dir, "home", ".aidevteam") });
    assert.ok(summary);
    assert.equal(summary!.common, 0, "no common rows indexed from an uncontained override");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("zero-egress: building the index opens no network connection", async () => {
  const dir = tmp();
  try {
    const project = path.join(dir, "project");
    const docs = path.join(project, "docs");
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, "n.md"), "---\nscope: project\n---\n# N\n\nbody\n");
    const dbPath = path.join(dir, "home", ".aidevteam", "memory", "memory.db");

    const net = await import("node:net");
    const origConnect = net.Socket.prototype.connect;
    const origFetch = globalThis.fetch;
    let attempts = 0;
    net.Socket.prototype.connect = function trapped() {
      attempts++;
      throw new Error("socket connect during index build");
    } as typeof origConnect;
    globalThis.fetch = (() => {
      attempts++;
      throw new Error("fetch during index build");
    }) as typeof fetch;
    try {
      await buildIndex({ project, dbPath, commonVault: null });
    } finally {
      net.Socket.prototype.connect = origConnect;
      globalThis.fetch = origFetch;
    }
    assert.equal(attempts, 0, "no socket connect / fetch attempted during build");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
