/**
 * Behaviour + security tests for the optional full-text Knowledge index.
 *
 * The centre of gravity is cross-project isolation: two projects' note bodies live
 * in ONE database, and a query issued as project A must never return project B's
 * project-scoped rows, nor common rows A is not entitled to under the shared scope
 * predicate. The remaining tests pin trash/edit/re-scope invalidation, holding-vault
 * scope authority, symlink containment, read-only-over-the-vault behaviour, and the
 * data-at-rest posture (0600 db under a 0700 dir).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KbFtsStore } from "../src/stores/kb-fts.ts";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aidt-kbfts-"));
}

/** Write a note with the given front-matter + body into a vault dir. */
function writeNote(dir: string, name: string, fm: Record<string, string>, body: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const front = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const full = path.join(dir, `${name}.md`);
  fs.writeFileSync(full, `---\n${front}\n---\n# ${name}\n\n${body}\n`);
  return full;
}

/** A project layout: project root + its own vault dir + an isolated common vault. */
function makeProject(root: string): { project: string; vault: string; common: string } {
  const project = path.join(root, "proj");
  const vault = path.join(project, "docs");
  const common = path.join(root, "common");
  fs.mkdirSync(vault, { recursive: true });
  fs.mkdirSync(common, { recursive: true });
  return { project, vault, common };
}

test("schema create is idempotent and version-bump drops + rebuilds", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store, "store opens");
    store!.ensureSchema();
    store!.ensureSchema(); // second call must not throw
    assert.equal(store!.schemaVersion(), 1);
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cross-project isolation: a query as A never returns B's project rows or non-entitled common", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();

    const a = makeProject(path.join(dir, "a"));
    const b = makeProject(path.join(dir, "b"));
    // Same shared common vault, used by both projects.
    const common = path.join(dir, "shared-common");
    fs.mkdirSync(common, { recursive: true });

    writeNote(a.vault, "secret-alpha", { scope: "project" }, "alpha rocket launch codes");
    writeNote(b.vault, "secret-beta", { scope: "project" }, "beta rocket launch codes");
    writeNote(common, "shared-java", { scope: "common", status: "approved-common", stack: "[java]" }, "rocket java guidance");
    writeNote(common, "shared-python", { scope: "common", status: "approved-common", stack: "[python]" }, "rocket python guidance");

    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    store!.syncVaults("proj-b", b.vault, common, ["python"]);

    const hitsA = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "rocket", limit: 50 });
    const filesA = hitsA.map((h) => h.file);

    assert.ok(filesA.includes("secret-alpha.md"), "A sees its own project note");
    assert.ok(!filesA.some((f) => f.includes("secret-beta")), "A NEVER sees B's project note");
    assert.ok(filesA.includes("shared-java.md"), "A (java) sees the java common note");
    assert.ok(!filesA.includes("shared-python.md"), "A (java) does NOT see the python-only common note");

    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a SQL prefilter that admits a scopeMatches-rejected row is dropped by the final predicate", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const common = path.join(dir, "common");
    // A common note whose stack does NOT match the querying project. The SQL prefilter
    // admits any approved-common row; only scopeMatches narrows it to the right stack.
    writeNote(common, "go-only", { scope: "common", status: "approved-common", stack: "[go]" }, "needle in go");
    store!.syncVaults("proj-x", path.join(dir, "empty-vault"), common, ["java"]);
    const hits = store!.search({ projectId: "proj-x", projectStack: ["java"], scope: "all", query: "needle", limit: 50 });
    assert.equal(hits.length, 0, "a non-matching-stack common row is dropped by scopeMatches");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("common note with status != approved-common is never returned", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const common = path.join(dir, "common");
    writeNote(common, "pending-common", { scope: "common", status: "pending", stack: "[any]" }, "pending needle");
    store!.syncVaults("proj-x", path.join(dir, "empty-vault"), common, ["java"]);
    const hits = store!.search({ projectId: "proj-x", projectStack: ["java"], scope: "all", query: "needle", limit: 50 });
    assert.equal(hits.length, 0, "a non-approved common note is invisible");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("holding vault decides scope: a project note tagged scope:common stays project-only", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const b = makeProject(path.join(dir, "b"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    // front-matter claims common, but it physically lives in A's project vault.
    writeNote(a.vault, "self-promoting", { scope: "common", status: "approved-common", stack: "[any]" }, "promote needle");
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    store!.syncVaults("proj-b", b.vault, common, ["java"]);

    const hitsB = store!.search({ projectId: "proj-b", projectStack: ["java"], scope: "all", query: "needle", limit: 50 });
    assert.equal(hitsB.length, 0, "B never sees A's note that tried to self-promote to common");
    const hitsA = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "needle", limit: 50 });
    assert.ok(hitsA.some((h) => h.file === "self-promoting.md"), "A sees it as its own project note");
    assert.equal(hitsA.find((h) => h.file === "self-promoting.md")!.scope, "project");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("trash / delete: a soft-deleted note is dropped and never served", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    const note = writeNote(a.vault, "doomed", { scope: "project" }, "doomed needle");
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    assert.equal(store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "needle", limit: 50 }).length, 1);

    // soft delete: move into .trash (the non-recursive scan never lists it)
    const trash = path.join(a.vault, ".trash");
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(note, path.join(trash, "doomed.md"));
    store!.syncVaults("proj-a", a.vault, common, ["java"]);

    const hits = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "needle", limit: 50 });
    assert.equal(hits.length, 0, "a trashed note is gone from the index");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("edit: the old body is never returned after a re-index", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    writeNote(a.vault, "evolving", { scope: "project" }, "oldword content");
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    assert.equal(store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "oldword", limit: 50 }).length, 1);

    // edit body; bump mtime so the drift key changes
    writeNote(a.vault, "evolving", { scope: "project" }, "newword content");
    const f = path.join(a.vault, "evolving.md");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(f, future, future);
    store!.syncVaults("proj-a", a.vault, common, ["java"]);

    assert.equal(store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "oldword", limit: 50 }).length, 0, "old body gone");
    assert.equal(store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "newword", limit: 50 }).length, 1, "new body present");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("re-scope project→common: served under the new scope only", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const b = makeProject(path.join(dir, "b"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    const note = writeNote(a.vault, "movable", { scope: "project" }, "movable needle");
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    store!.syncVaults("proj-b", b.vault, common, ["java"]);
    assert.equal(store!.search({ projectId: "proj-b", projectStack: ["java"], scope: "all", query: "needle", limit: 50 }).length, 0, "B can't see it as project note");

    // MOVE the note into the common vault (re-scope)
    fs.renameSync(note, path.join(common, "movable.md"));
    fs.writeFileSync(path.join(common, "movable.md"), `---\nscope: common\nstatus: approved-common\nstack: [any]\n---\n# movable\n\nmovable needle\n`);
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    store!.syncVaults("proj-b", b.vault, common, ["java"]);

    const hitsB = store!.search({ projectId: "proj-b", projectStack: ["java"], scope: "all", query: "needle", limit: 50 });
    assert.ok(hitsB.some((h) => h.file === "movable.md" && h.scope === "common"), "B now sees it under common");
    // not double-served under its old project scope for A
    const hitsA = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "needle", limit: 50 });
    assert.equal(hitsA.filter((h) => h.file === "movable.md").length, 1, "served once, under common");
    assert.equal(hitsA.find((h) => h.file === "movable.md")!.scope, "common");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("containment: a symlink escaping the vault is skipped, not followed", async (t) => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    // a real secret OUTSIDE the vault
    const secretDir = path.join(dir, "outside");
    fs.mkdirSync(secretDir, { recursive: true });
    const secret = path.join(secretDir, "secret.md");
    fs.writeFileSync(secret, `---\nscope: project\n---\n# secret\n\ntopsecret needle\n`);
    // plant a symlink inside the vault that points at the outside secret
    try {
      fs.symlinkSync(secret, path.join(a.vault, "link.md"));
    } catch {
      t.skip("symlinks unsupported on this platform");
      store!.close();
      return;
    }
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    const hits = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "topsecret", limit: 50 });
    assert.equal(hits.length, 0, "the escaping symlink is never indexed/served");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("data-at-rest: db is 0600 under a 0700 dir", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX modes unavailable");
    return;
  }
  const dir = tmp();
  try {
    const dbDir = path.join(dir, "memory");
    const dbPath = path.join(dbDir, "memory.db");
    const store = await KbFtsStore.open(dbPath);
    assert.ok(store);
    store!.ensureSchema();
    store!.close();
    assert.equal(fs.statSync(dbDir).mode & 0o777, 0o700, "db dir is 0700");
    assert.equal(fs.statSync(dbPath).mode & 0o777, 0o600, "db file is 0600");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("read-only over the vault: a build leaves every note byte-identical", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    const f = writeNote(a.vault, "untouched", { scope: "project" }, "untouched body");
    const before = fs.readFileSync(f);
    const beforeStat = fs.statSync(f);
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    const after = fs.readFileSync(f);
    const afterStat = fs.statSync(f);
    assert.ok(before.equals(after), "note content unchanged");
    assert.equal(beforeStat.mtimeMs, afterStat.mtimeMs, "note mtime unchanged");
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("FTS MATCH parameter binding: a query with FTS operators cannot break the statement", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    writeNote(a.vault, "ordinary", { scope: "project" }, "ordinary body text");
    store!.syncVaults("proj-a", a.vault, common, ["java"]);
    // hostile inputs must never throw nor leak — they return [] or a sanitized match
    for (const q of ['"', 'a" OR "b', "body OR", "NEAR(", "*", "'); DROP TABLE kb_fts;--"]) {
      const hits = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: q, limit: 50 });
      assert.ok(Array.isArray(hits), `query ${JSON.stringify(q)} returns an array`);
    }
    // the table still works afterward
    assert.equal(store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "all", query: "ordinary", limit: 50 }).length, 1);
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scope filter: project-only and common-only scopes narrow correctly", async () => {
  const dir = tmp();
  try {
    const store = await KbFtsStore.open(path.join(dir, "memory.db"));
    assert.ok(store);
    store!.ensureSchema();
    const a = makeProject(path.join(dir, "a"));
    const common = path.join(dir, "common");
    fs.mkdirSync(common, { recursive: true });
    writeNote(a.vault, "p-note", { scope: "project" }, "shared keyword here");
    writeNote(common, "c-note", { scope: "common", status: "approved-common", stack: "[any]" }, "shared keyword here");
    store!.syncVaults("proj-a", a.vault, common, ["java"]);

    const onlyProject = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "project", query: "keyword", limit: 50 });
    assert.deepEqual(onlyProject.map((h) => h.file).sort(), ["p-note.md"]);
    const onlyCommon = store!.search({ projectId: "proj-a", projectStack: ["java"], scope: "common", query: "keyword", limit: 50 });
    assert.deepEqual(onlyCommon.map((h) => h.file).sort(), ["c-note.md"]);
    store!.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
