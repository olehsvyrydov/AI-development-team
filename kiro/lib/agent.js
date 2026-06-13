'use strict';
/*
 * Builds and additively merges the kiro-cli custom-agent JSON (`.kiro/agents/dart.json`)
 * — the Kiro analog of `plugin.json`. It bundles the dart `mcpServers` entry, the two
 * hook shims (which EXEC the existing hook modules), the steering `resources`, and a
 * read-only `allowedTools` mirror of the mcp.json autoApprove (derived from the SAME
 * read-only tools source so they cannot drift).
 *
 * Merge is additive: into a user's existing agent file DART inserts ONLY its own
 * mcpServers.dart, its two hooks, and its resources — the user's prompt / model /
 * tools / other servers / other hooks survive byte-meaningfully.
 */
const path = require('node:path');
const { READ_ONLY_TOOLS } = require('./tools');

/** Absolute paths to the two hook shims that exec the existing hook modules. */
function shimPaths(repoRoot) {
  return {
    agentSpawn: path.join(repoRoot, 'kiro', 'hooks', 'agent-spawn.cjs'),
    userPromptSubmit: path.join(repoRoot, 'kiro', 'hooks', 'user-prompt-submit.cjs'),
  };
}

/** The DART blocks to merge into a custom-agent JSON. */
function dartBlocks(repoRoot, dartEntry) {
  const shims = shimPaths(repoRoot);
  return {
    mcpServers: { dart: dartEntry },
    hooks: {
      agentSpawn: [{ command: 'node', args: [shims.agentSpawn], timeout_ms: 15000 }],
      userPromptSubmit: [{ command: 'node', args: [shims.userPromptSubmit], timeout_ms: 5000 }],
    },
    resources: [
      'file://.kiro/steering/dart-workflow.md',
      'file://.kiro/steering/dart-team.md',
      'file://.kiro/steering/dart-digest.md',
    ],
    allowedTools: READ_ONLY_TOOLS.map((t) => `@dart/${t}`),
  };
}

/** A fresh DART agent JSON when none exists. */
function buildAgent(repoRoot, dartEntry) {
  const blocks = dartBlocks(repoRoot, dartEntry);
  return {
    name: 'dart',
    description: 'DART — AI Development Team workflow + agents',
    prompt: 'Defer to the DART steering files for the agent team and the workflow gates.',
    mcpServers: blocks.mcpServers,
    hooks: blocks.hooks,
    resources: blocks.resources,
    tools: ['@dart'],
    allowedTools: blocks.allowedTools,
  };
}

/**
 * Additively merge the DART blocks into an existing parsed agent object. Returns
 * a NEW object. The user's prompt / model / tools / other mcpServers / other
 * hooks are preserved; only DART's own keys are inserted/replaced.
 */
function mergeAgent(existing, repoRoot, dartEntry) {
  if (!existing || typeof existing !== 'object') return buildAgent(repoRoot, dartEntry);
  const blocks = dartBlocks(repoRoot, dartEntry);
  const merged = { ...existing };
  merged.mcpServers = { ...(existing.mcpServers || {}), dart: dartEntry };
  merged.hooks = {
    ...(existing.hooks || {}),
    agentSpawn: blocks.hooks.agentSpawn,
    userPromptSubmit: blocks.hooks.userPromptSubmit,
  };
  merged.resources = mergeResources(existing.resources, blocks.resources);
  merged.allowedTools = mergeAllowed(existing.allowedTools, blocks.allowedTools);
  return merged;
}

function mergeResources(userResources, dartResources) {
  const out = Array.isArray(userResources) ? [...userResources] : [];
  for (const r of dartResources) if (!out.includes(r)) out.push(r);
  return out;
}

function mergeAllowed(userAllowed, dartAllowed) {
  const out = Array.isArray(userAllowed) ? [...userAllowed] : [];
  for (const t of dartAllowed) if (!out.includes(t)) out.push(t);
  return out;
}

module.exports = { buildAgent, mergeAgent, shimPaths, dartBlocks };
