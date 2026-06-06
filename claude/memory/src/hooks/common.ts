/** Shared helpers for the SessionStart / PreCompact hooks. */
import crypto from "node:crypto";
import type { ScoredPoint } from "../types.ts";

/** Read the hook's JSON payload from stdin (Claude Code passes it there). */
export async function readStdinJson(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Deterministic point id (latest-wins dedup), mirroring the prior uuid5 scheme. */
export function pointId(sessionId: string, chunkType: string, content: string): string {
  return crypto
    .createHash("sha1")
    .update(`${sessionId}::${chunkType}::${content.slice(0, 200)}`)
    .digest("hex");
}

const SECTION_HEADERS: Record<string, string> = {
  decision: "Decisions & Approach Choices",
  file_change: "Files Modified",
  task: "Task Progress",
  discussion: "Key Discussions",
  error_resolution: "Error Resolutions",
};

/** Format recall hits into the markdown block injected into the session. */
export function formatContext(results: ScoredPoint[], title: string): string {
  if (!results.length) return "";
  const grouped = new Map<string, string[]>();
  for (const r of results) {
    const type = String(r.payload.chunk_type ?? "other");
    const content = String(r.payload.content ?? "");
    if (!content) continue;
    (grouped.get(type) ?? grouped.set(type, []).get(type)!).push(content);
  }
  const sections: string[] = [];
  for (const [type, header] of Object.entries(SECTION_HEADERS)) {
    const items = grouped.get(type);
    if (!items?.length) continue;
    sections.push([`### ${header}`, ...items.map((i) => `- ${i}`)].join("\n"));
  }
  return sections.length ? `## ${title}\n${sections.join("\n\n")}` : "";
}

/** Run a promise with a deadline; resolve to `fallback` if it doesn't finish in time. */
export function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms).unref()),
  ]);
}
