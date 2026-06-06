/**
 * Parse a Claude Code transcript JSONL into structured context chunks.
 *
 * TypeScript port of the original Python `transcript_parser.py` — behavior
 * preserved (same patterns, same chunk types, same size normalization), so the
 * memory captured on PreCompact is identical to the prior implementation.
 */
import fs from "node:fs";
import path from "node:path";
import type { Chunk, ChunkType } from "./types.ts";

const DECISION_PATTERNS =
  /(instead of|rather than|I recommend|let's use|should we use|better (for|because|than)|I'll go with|decided to|the (approach|choice|decision|strategy) is|we('ll| will| should) (use|go with|choose|pick|adopt)|approved|rejected|choosing .+ over)/i;

const ERROR_PATTERNS =
  /(error|exception|failed|failing|broken|crash|bug|issue|problem|not working|connection refused|timeout|doesn't work|can't connect|permission denied)/i;

const MIN_SUBSTANTIVE_LENGTH = 30;
const FILE_WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

const COMMAND_TO_AGENT: Record<string, string> = {
  po: "product-owner", max: "product-owner",
  sm: "scrum-master", luda: "scrum-master",
  arch: "solution-architect", jorge: "solution-architect",
  ba: "business-analyst", anna: "business-analyst",
  secops: "secops-engineer", soren: "secops-engineer",
  fin: "uk-accountant", inga: "uk-accountant",
  legal: "uk-legal-counsel", alex: "uk-legal-counsel",
  ui: "ui-designer", aura: "ui-designer",
  fe: "frontend-developer", finn: "frontend-developer",
  be: "backend-developer", james: "backend-developer",
  rev: "reviewer", reviewer: "reviewer",
  qa: "tester", rob: "tester", tester: "tester",
  e2e: "e2e-tester", adam: "e2e-tester",
  mkt: "apex", apex: "apex",
};
const COMMAND_PATTERN = /^\/(\w+)\b/;

interface Message {
  type?: string;
  message?: { content?: unknown };
}
interface ToolUse {
  type?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export function loadMessages(jsonlPath: string): Message[] {
  let text: string;
  try {
    text = fs.readFileSync(jsonlPath, "utf8");
  } catch {
    return [];
  }
  const out: Message[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let entry: Message;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "user" || entry.type === "assistant" || entry.type === "tool_result") {
      out.push(entry);
    }
  }
  return out;
}

function textContent(message: Message): string {
  const content = message.message?.content ?? "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (block && typeof block === "object" && (block as ToolUse).type === "text") {
        texts.push(String((block as { text?: string }).text ?? ""));
      }
    }
    return texts.join(" ");
  }
  return "";
}

function toolUses(message: Message): ToolUse[] {
  const content = message.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (b): b is ToolUse => !!b && typeof b === "object" && (b as ToolUse).type === "tool_use",
  );
}

function extractDecisions(messages: Message[]): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type !== "assistant") continue;
    const text = textContent(msg);
    if (!text || text.length < MIN_SUBSTANTIVE_LENGTH) continue;
    if (!DECISION_PATTERNS.test(text)) continue;
    const parts: string[] = [];
    if (i > 0 && messages[i - 1].type === "user") {
      const u = textContent(messages[i - 1]);
      if (u) parts.push(`Q: ${u}`);
    }
    parts.push(`A: ${text}`);
    out.push({ chunk_type: "decision", content: parts.join("\n"), metadata: {} });
  }
  return out;
}

function extractFileChanges(messages: Message[]): Chunk[] {
  const out: Chunk[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    for (const tu of toolUses(msg)) {
      const name = tu.name ?? "";
      if (!FILE_WRITE_TOOLS.has(name)) continue;
      const input = tu.input ?? {};
      const filePath = String(input.file_path ?? "");
      if (!filePath || seen.has(filePath)) continue;
      seen.add(filePath);
      const filename = path.basename(filePath);
      let summary: string;
      if (name === "Write") {
        summary = `Wrote ${filename}: ${String(input.content ?? "").slice(0, 200)}`;
      } else if (name === "Edit") {
        const oldS = String(input.old_string ?? "").slice(0, 100);
        const newS = String(input.new_string ?? "").slice(0, 100);
        summary = `Edited ${filename}: '${oldS}' → '${newS}'`;
      } else {
        summary = `Modified ${filename}`;
      }
      out.push({
        chunk_type: "file_change",
        content: summary,
        metadata: { file_path: filePath, tool: name },
      });
    }
  }
  return out;
}

function extractTaskState(messages: Message[]): Chunk[] {
  const out: Chunk[] = [];
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    for (const tu of toolUses(msg)) {
      const input = tu.input ?? {};
      if (tu.name === "TaskCreate") {
        out.push({
          chunk_type: "task",
          content: `Task created: ${String(input.subject ?? "")}. ${String(input.description ?? "")}`,
          metadata: { action: "created" },
        });
      } else if (tu.name === "TaskUpdate") {
        const taskId = String(input.taskId ?? "");
        const status = String(input.status ?? "");
        const subject = String(input.subject ?? "");
        const parts = [`Task #${taskId}`];
        if (status) parts.push(`→ ${status}`);
        if (subject) parts.push(`(${subject})`);
        out.push({
          chunk_type: "task",
          content: parts.join(" "),
          metadata: { action: "updated", task_id: taskId, status },
        });
      }
    }
  }
  return out;
}

function extractKeyDiscussions(messages: Message[]): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const userMsg = messages[i];
    const nextMsg = messages[i + 1];
    if (userMsg.type !== "user" || nextMsg.type !== "assistant") continue;
    const userText = textContent(userMsg);
    const assistantText = textContent(nextMsg);
    if (!userText || !assistantText) continue;
    if (
      userText.length < MIN_SUBSTANTIVE_LENGTH &&
      assistantText.length < MIN_SUBSTANTIVE_LENGTH
    ) {
      continue;
    }
    if (ERROR_PATTERNS.test(userText) && assistantText.length >= MIN_SUBSTANTIVE_LENGTH) {
      out.push({
        chunk_type: "error_resolution",
        content: `Problem: ${userText}\nResolution: ${assistantText}`,
        metadata: {},
      });
      continue;
    }
    const isQuestion = userText.trimEnd().endsWith("?") || userText.length >= MIN_SUBSTANTIVE_LENGTH;
    const hasDetailedAnswer = assistantText.length >= 80;
    if (isQuestion && hasDetailedAnswer) {
      out.push({
        chunk_type: "discussion",
        content: `Q: ${userText}\nA: ${assistantText}`,
        metadata: {},
      });
    }
  }
  return out;
}

export function normalizeChunks(chunks: Chunk[], maxSize = 400): Chunk[] {
  if (!chunks.length) return [];
  const out: Chunk[] = [];
  for (const chunk of chunks) {
    const content = chunk.content;
    if (content.length <= maxSize) {
      out.push(chunk);
      continue;
    }
    const sentences = content.split(/(?<=\.)\s+/);
    let current = "";
    const push = (c: ChunkType, text: string, meta: Chunk["metadata"]) => {
      if (text.trim()) out.push({ chunk_type: c, content: text.trim(), metadata: { ...meta } });
    };
    for (const sentence of sentences) {
      if (current && current.length + sentence.length + 1 > maxSize) {
        push(chunk.chunk_type, current, chunk.metadata);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}`.trim() : sentence;
      }
    }
    push(chunk.chunk_type, current, chunk.metadata);
  }
  return out;
}

export function detectAgent(messages: Message[]): string | null {
  for (const msg of messages) {
    if (msg.type === "user") {
      const m = textContent(msg).trim().match(COMMAND_PATTERN);
      if (m) {
        const agent = COMMAND_TO_AGENT[m[1].toLowerCase()];
        if (agent) return agent;
      }
    }
    if (msg.type === "assistant") {
      for (const tu of toolUses(msg)) {
        if (tu.name === "Skill") {
          const skill = String(tu.input?.skill ?? "").toLowerCase();
          const agent = COMMAND_TO_AGENT[skill];
          if (agent) return agent;
        }
      }
    }
  }
  return null;
}

/** Parse a transcript JSONL into normalized, agent-tagged context chunks. */
export function parseTranscript(jsonlPath: string): Chunk[] {
  const messages = loadMessages(jsonlPath);
  if (!messages.length) return [];
  let chunks: Chunk[] = [
    ...extractDecisions(messages),
    ...extractFileChanges(messages),
    ...extractTaskState(messages),
    ...extractKeyDiscussions(messages),
  ];
  chunks = normalizeChunks(chunks);
  const agent = detectAgent(messages);
  if (agent) for (const c of chunks) c.metadata.agent_name = agent;
  return chunks;
}
