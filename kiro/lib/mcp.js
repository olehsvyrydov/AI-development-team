'use strict';
/*
 * Generates and additively merges the `.kiro/settings/mcp.json` `dart` entry.
 *
 * The entry mirrors the CC plugin manifest (`.claude-plugin/.mcp.json`) shape:
 * the SAME bundled stdio server, bound to ONE project by `args[1]`. The only
 * Kiro-specific transform is resolving `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}`
 * to absolute paths at generation time (Kiro has no such expansion). The env
 * block carries env-var NAME references only — never a secret VALUE. autoApprove
 * lists read-only tools ONLY (from the single tools source).
 */
const path = require('node:path');
const { READ_ONLY_TOOLS } = require('./tools');

/** The env-var NAMES passed through to the server (overlay + memory keys). */
const ENV_NAMES = Object.freeze([
  'VOYAGE_API_KEY',
  'GEMINI_API_KEY',
  'QDRANT_URL',
  'QDRANT_API_KEY',
  'OPENMEMORY_API_KEY',
  'MEM0_API_KEY',
]);

/**
 * Build the `dart` MCP server entry. `serverPath` is the absolute path to the
 * bundled `dart-mcp/dist/server.cjs`; `projectDir` is the absolute path of the
 * project the generator was run for (becomes `args[1]`, binding the server to
 * that one project).
 */
function buildDartEntry(serverPath, projectDir) {
  const env = {};
  for (const name of ENV_NAMES) env[name] = '${' + name + '}';
  return {
    command: 'node',
    args: [serverPath, projectDir],
    env,
    disabled: false,
    autoApprove: [...READ_ONLY_TOOLS],
    disabledTools: [],
  };
}

/**
 * Additively merge the `dart` entry into an existing parsed mcp.json object,
 * preserving every other server and every unknown top-level key. Returns a NEW
 * object (does not mutate the input). Only `mcpServers.dart` is inserted/replaced.
 */
function mergeMcp(existing, dartEntry) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const merged = { ...base };
  merged.mcpServers = { ...(base.mcpServers && typeof base.mcpServers === 'object' ? base.mcpServers : {}) };
  merged.mcpServers.dart = dartEntry;
  return merged;
}

/** The relative path (under the .kiro root) of the mcp settings file. */
function relPath() {
  return path.join('settings', 'mcp.json');
}

module.exports = { buildDartEntry, mergeMcp, relPath, ENV_NAMES };
