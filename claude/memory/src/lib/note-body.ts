/**
 * Memory-side reduction of a note's raw markdown to its prose body, mirroring the hub's
 * `markdownBody` (hub/lib/state.js). The leading `---\n…\n---` front-matter block and a
 * single leading title heading are stripped and the result is trimmed. A parity test over
 * a shared fixture locks this to the hub so an indexed body and a displayed excerpt derive
 * from the same text — no markup or front-matter can leak into the index that the hub would
 * not also strip.
 *
 * @param raw the raw note text (any type tolerated)
 * @returns the prose body with front-matter and a leading title heading removed
 */
export function reduceBody(raw: unknown): string {
  let s = String(raw ?? "");
  const fm = s.match(/^---\n[\s\S]*?\n---\n?/);
  if (fm) s = s.slice(fm[0].length);
  s = s.replace(/^\s*#[^\n]*\n/, "");
  return s.trim();
}
