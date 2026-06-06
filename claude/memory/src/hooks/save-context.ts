#!/usr/bin/env node
/**
 * PreCompact hook — capture the salient context of the session before it is
 * compacted, tagged to the current project, for later recall.
 *
 * Security: C2 (secret-scrub + ignore-globs before any egress), C6 (always
 * exit 0; bounded transcript read; errors to stderr). A missing backend/key is
 * a no-op, not a failure.
 */
import fs from "node:fs";
import { parseTranscript } from "../transcript.ts";
import { scrubChunks, scrubSecrets } from "../scrub.ts";
import { renderDigest } from "../digest.ts";
import { loadMemoryConfig } from "../lib/config.ts";
import { projectId } from "../lib/project-id.ts";
import { getEmbedder } from "../embeddings/factory.ts";
import { getStore } from "../stores/factory.ts";
import type { VectorPoint } from "../types.ts";
import { pointId, readStdinJson } from "./common.ts";

const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024; // C6: bound the read

async function main(): Promise<void> {
  const input = await readStdinJson();
  const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path : "";
  const sessionId = typeof input.session_id === "string" ? input.session_id : "";
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  if (!transcriptPath || !sessionId) return;

  // Bound the transcript size before parsing (avoid OOM on a huge file).
  try {
    if (fs.statSync(transcriptPath).size > MAX_TRANSCRIPT_BYTES) {
      process.stderr.write("[memory] transcript too large; skipping capture\n");
      return;
    }
  } catch {
    return;
  }

  const cfg = loadMemoryConfig();
  const embedder = getEmbedder(cfg);
  const store = await getStore(cfg);
  if (!embedder || !store) {
    process.stderr.write(JSON.stringify({ status: "no-backend", chunks_saved: 0 }) + "\n");
    return;
  }

  // C2: scrub secrets and drop credential-sourced chunks BEFORE embedding/egress.
  const chunks = scrubChunks(parseTranscript(transcriptPath));
  const pid = projectId(cwd);
  await store.ensureCollections(embedder.dimensions);

  let saved = 0;
  if (chunks.length) {
    const vectors = await embedder.embedDocuments(chunks.map((c) => c.content));
    const points: VectorPoint[] = chunks.map((c, i) => ({
      id: pointId(sessionId, c.chunk_type, c.content),
      vector: vectors[i],
      payload: {
        content: c.content,
        chunk_type: c.chunk_type,
        session_id: sessionId,
        project_id: pid,
        project_path: cwd,
        scope: "project",
        embedding_model: embedder.model,
        ...c.metadata,
      },
    }));
    await store.upsert("session-context", points);
    saved = points.length;
  }

  // Also persist the current workflow-state digest as a single recovery row.
  try {
    const digest = scrubSecrets(renderDigest(cwd)); // C12: scrub before egress
    const [dv] = await embedder.embedDocuments([digest]);
    await store.upsert("session-context", [
      {
        id: pointId(sessionId, "workflow_state", cwd),
        vector: dv,
        payload: {
          content: digest,
          chunk_type: "workflow_state",
          session_id: sessionId,
          project_id: pid,
          project_path: cwd,
          scope: "project",
          embedding_model: embedder.model,
        },
      },
    ]);
  } catch {
    /* digest backup is best-effort */
  }

  store.close();
  process.stderr.write(JSON.stringify({ status: "saved", chunks_saved: saved }) + "\n");
}

main()
  .catch((e) => process.stderr.write(`[memory] save-context error: ${(e as Error).message}\n`))
  .finally(() => process.exit(0)); // C6: never break a session
