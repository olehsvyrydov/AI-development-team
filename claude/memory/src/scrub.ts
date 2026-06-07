/**
 * Secret-scrub + ignore-globs
 *
 * Transcript-derived chunks may contain secrets/PII/proprietary code. When the
 * user opts into embeddings, chunk text is sent to a third-party API, so we
 * (a) drop chunks sourced from credential-ish files, and (b) redact high-signal
 * secret patterns from the surviving text before it ever leaves the machine.
 *
 * This is defense-in-depth, not a guarantee — it cannot catch every secret. The
 * installer also discloses that enabling embeddings egresses project text.
 */
import type { Chunk } from "./types.ts";

const REDACTED = "[REDACTED-SECRET]";

/** High-signal secret patterns. Conservative — aimed at obvious credentials. */
const PATTERNS: RegExp[] = [
  /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z]*PRIVATE KEY-----/g, // PEM private keys
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bASIA[0-9A-Z]{16}\b/g, // AWS temp key id
  /\bAIza[0-9A-Za-z\-_]{35}\b/g, // Google API key
  /\bgh[pousr]_[0-9A-Za-z]{20,}\b/g, // GitHub tokens
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, // Slack tokens
  /\bsk-[0-9A-Za-z-]{16,}\b/g, // OpenAI-style / generic sk- keys
  /\b(?:Bearer|Authorization:\s*Bearer)\s+[0-9A-Za-z._\-]{16,}/gi, // bearer tokens
  // KEY=secret / "password": "..." style assignments (redact the VALUE, keep the name)
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*["']?[^\s"']{6,}["']?/gi,
];

/** Redact obvious secrets from a string. Never throws. */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, (match, name?: string) =>
      // for KEY=value assignments keep the key name, redact the value
      name ? `${name}=${REDACTED}` : REDACTED,
    );
  }
  return out;
}

/** Basenames/paths that must never be ingested (credential-bearing files). */
const IGNORE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /(^|\/)[^/]*secret[^/]*$/i,
  /(^|\/)[^/]*credential[^/]*$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.git-credentials$/i,
];

/** True if a source file path should be excluded from ingestion entirely. */
export function isIgnoredSource(filePath: string): boolean {
  const p = String(filePath || "");
  return IGNORE_PATTERNS.some((re) => re.test(p));
}

/** Drop chunks sourced from ignored files; redact secrets from the rest. */
export function scrubChunks(chunks: Chunk[]): Chunk[] {
  const out: Chunk[] = [];
  for (const c of chunks) {
    const src = c.metadata?.file_path;
    if (typeof src === "string" && isIgnoredSource(src)) continue;
    out.push({ ...c, content: scrubSecrets(c.content) });
  }
  return out;
}
