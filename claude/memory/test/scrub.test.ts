/**
 * TDD for security condition C2 — secret-scrub + ignore-globs before embedding.
 * Chunks may contain secrets/PII from the user's project; we must not egress them
 * to a third-party embedding API. Written before the implementation (Red).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubSecrets, isIgnoredSource, scrubChunks } from "../src/scrub.ts";
import type { Chunk } from "../src/types.ts";

test("redacts AWS access key ids", () => {
  const out = scrubSecrets("creds: AKIAIOSFODNN7EXAMPLE end");
  assert.ok(!out.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.match(out, /\[REDACTED/);
});

test("redacts bearer tokens and Authorization headers", () => {
  const out = scrubSecrets("Authorization: Bearer sk-abcdef0123456789abcdef0123456789");
  assert.ok(!out.includes("sk-abcdef0123456789abcdef0123456789"));
});

test("redacts KEY=secret style env assignments", () => {
  const out = scrubSecrets("VOYAGE_API_KEY=pa-1234567890abcdef GEMINI_API_KEY=AIzaSyD-EXAMPLE_KEY_123");
  assert.ok(!out.includes("pa-1234567890abcdef"));
  assert.ok(!out.includes("AIzaSyD-EXAMPLE_KEY_123"));
});

test("redacts private key blocks", () => {
  const out = scrubSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----");
  assert.ok(!out.includes("MIIEabc"));
});

test("leaves ordinary prose untouched", () => {
  const text = "We decided to use a token-bucket rate limiter for the reset endpoint.";
  assert.equal(scrubSecrets(text), text);
});

test("ignore-globs match credential-ish source paths", () => {
  for (const f of [".env", ".env.local", "config/.env.production", "id_rsa", "secrets.yaml", "server.pem", "my-credentials.json"]) {
    assert.ok(isIgnoredSource(f), `${f} should be ignored`);
  }
  for (const f of ["src/index.ts", "README.md", "notes.txt"]) {
    assert.ok(!isIgnoredSource(f), `${f} should NOT be ignored`);
  }
});

test("scrubChunks drops chunks sourced from ignored files and redacts the rest", () => {
  const chunks: Chunk[] = [
    { chunk_type: "file_change", content: "Wrote app.ts", metadata: { file_path: ".env" } },
    { chunk_type: "decision", content: "key is AKIAIOSFODNN7EXAMPLE", metadata: {} },
    { chunk_type: "discussion", content: "Q: how to test?\nA: use node:test", metadata: {} },
  ];
  const out = scrubChunks(chunks);
  assert.equal(out.length, 2, "the .env-sourced chunk is dropped");
  assert.ok(!JSON.stringify(out).includes("AKIAIOSFODNN7EXAMPLE"), "secrets redacted in surviving chunks");
});
