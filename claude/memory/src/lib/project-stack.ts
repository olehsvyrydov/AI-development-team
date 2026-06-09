/**
 * Read a project's declared knowledge stack, mirroring the hub's projectStack:
 * manual `knowledge.stack` in the project-local config wins; else a bounded
 * marker-file auto-detect; else ["any"]. Tokens are normalized against the closed
 * vocabulary and never used to build a path. Never throws.
 */
import fs from "node:fs";
import path from "node:path";

const STACK_VOCAB = new Set([
  "any", "node", "typescript", "python", "rust", "go", "java", "kotlin", "ruby", "php", "docker", "ci",
]);

const STACK_MARKERS: Array<[string, string]> = [
  ["package.json", "node"],
  ["tsconfig.json", "typescript"],
  ["pyproject.toml", "python"],
  ["requirements.txt", "python"],
  ["Cargo.toml", "rust"],
  ["go.mod", "go"],
  ["pom.xml", "java"],
  ["build.gradle", "java"],
  ["build.gradle.kts", "kotlin"],
  ["Gemfile", "ruby"],
  ["composer.json", "php"],
];

function normTokens(raw: unknown): string[] {
  let items: unknown[];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === "string") items = [raw];
  else return [];
  const out: string[] = [];
  for (const it of items) {
    if (out.length >= 16) break;
    if (typeof it !== "string") continue;
    const t = it.toLowerCase().trim();
    if (STACK_VOCAB.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export function projectStackOf(projectDir: string): string[] {
  try {
    const cfgPath = path.join(projectDir, ".aidevteam", "config.json");
    if (fs.existsSync(cfgPath)) {
      let cfg: unknown = null;
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch { cfg = null; }
      const know = cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>).knowledge : null;
      const stack = know && typeof know === "object" ? (know as Record<string, unknown>).stack : undefined;
      const manual = normTokens(stack);
      if (manual.length) return manual;
    }
  } catch { /* fall through */ }
  const found = new Set<string>();
  for (const [marker, label] of STACK_MARKERS) {
    try { if (fs.existsSync(path.join(projectDir, marker))) found.add(label); } catch { /* skip */ }
  }
  const auto = [...found].sort();
  return auto.length ? auto : ["any"];
}
