/**
 * Idempotent wiring of the memory hooks into a Claude Code settings object.
 *
 * Pure functions over the settings JSON (the wizard handles file IO) so wiring
 * is unit-testable. Re-running never duplicates our entries and never
 * touches unrelated keys (permissions/statusLine) or the user's other hooks.
 *
 * Schema (confirmed): hooks.<Event> = [{ matcher, hooks:[{type,command,args,timeout}] }].
 * SessionStart matcher "startup|resume|compact"; PreCompact "".
 * Run as `node --no-warnings <hook>.ts` (Node runs TS natively; --no-warnings
 * also silences the node:sqlite experimental notice).
 */
export interface WireOpts {
  restorePath: string;
  savePath: string;
  nodeBin?: string;
  sessionTimeout?: number;
  compactTimeout?: number;
}

interface Handler {
  type: "command";
  command: string;
  args?: string[];
  timeout?: number;
  [k: string]: unknown;
}
interface Group {
  matcher?: string;
  hooks: Handler[];
}
/** External settings.json is untyped input — accept loosely, return precisely. */
type SettingsInput = Record<string, unknown> | null | undefined;
interface Settings {
  hooks: Record<string, Group[]>;
  [k: string]: unknown;
}

const SESSION_MATCHER = "startup|resume|compact";

function handler(nodeBin: string, scriptPath: string, timeout: number): Handler {
  return { type: "command", command: nodeBin, args: ["--no-warnings", scriptPath], timeout };
}

/** True if a handler is one of ours (identified by the script path in its args). */
function isOurs(h: Handler, scriptPath: string): boolean {
  return Array.isArray(h.args) && h.args.includes(scriptPath);
}

/** Ensure exactly one group for `matcher` contains our handler; drop stale copies, keep others. */
function upsert(groups: Group[] | undefined, matcher: string, h: Handler, scriptPath: string): Group[] {
  // strip our previous handler from every group (idempotency), keep foreign handlers
  const cleaned = (groups ?? [])
    .map((g) => ({ ...g, hooks: g.hooks.filter((x) => !isOurs(x, scriptPath)) }))
    .filter((g) => g.hooks.length > 0);
  const target = cleaned.find((g) => (g.matcher ?? "") === matcher);
  if (target) target.hooks.push(h);
  else cleaned.push({ matcher, hooks: [h] });
  return cleaned;
}

export function wireHooks(settings: SettingsInput, opts: WireOpts): Settings {
  const nodeBin = opts.nodeBin ?? "node";
  const s = structuredClone(settings ?? {}) as Settings;
  s.hooks = s.hooks ?? {};
  s.hooks.SessionStart = upsert(
    s.hooks.SessionStart,
    SESSION_MATCHER,
    handler(nodeBin, opts.restorePath, opts.sessionTimeout ?? 15),
    opts.restorePath,
  );
  s.hooks.PreCompact = upsert(
    s.hooks.PreCompact,
    "",
    handler(nodeBin, opts.savePath, opts.compactTimeout ?? 60),
    opts.savePath,
  );
  return s;
}

/** Remove our hooks (the "disable later" path); leaves other hooks intact. */
export function unwireHooks(settings: SettingsInput, opts: WireOpts): Settings {
  const s = structuredClone(settings ?? {}) as Settings;
  if (!s.hooks) return s;
  for (const [event, paths] of [
    ["SessionStart", opts.restorePath],
    ["PreCompact", opts.savePath],
  ] as const) {
    const groups = s.hooks[event];
    if (!groups) continue;
    s.hooks[event] = groups
      .map((g) => ({ ...g, hooks: g.hooks.filter((x) => !isOurs(x, paths)) }))
      .filter((g) => g.hooks.length > 0);
  }
  return s;
}

export function hooksWired(settings: SettingsInput, opts: WireOpts): boolean {
  const hooks = (settings as Settings | null | undefined)?.hooks;
  if (!hooks) return false;
  const has = (groups: Group[] | undefined, p: string): boolean =>
    !!groups?.some((g) => g.hooks.some((h) => isOurs(h, p)));
  return has(hooks.SessionStart, opts.restorePath) && has(hooks.PreCompact, opts.savePath);
}
