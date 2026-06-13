'use strict';
/*
 * Builds the generation PLAN: the full set of files the generator would emit,
 * each as { rel, content, kind }, computed from the single sources of truth
 * (the bundled server, workflow.yaml, the skills, the digest CLI). Pure — it
 * reads sources and renders strings; it writes NOTHING. The CLI consumes the
 * plan for both --dry-run (print only) and the real write path (no-clobber merge).
 */
const fs = require('node:fs');
const path = require('node:path');
const mcp = require('./mcp');
const steering = require('./steering');
const agent = require('./agent');
const { renderDigestText } = require('./write-digest');

/** Absolute path to the bundled stdio MCP server within the repo. */
function serverPath(repoRoot) {
  return path.join(repoRoot, 'dart-mcp', 'dist', 'server.cjs');
}

function readWorkflowYaml(repoRoot) {
  const p = path.join(repoRoot, 'claude', 'workflow', 'workflow.yaml');
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return 'preset: solo\n';
  }
}

/**
 * Build the plan for a chosen scope. `project` is the abs project dir (the value
 * bound to the server's args[1]); `repoRoot` locates the reused sources.
 *
 * Returns { scope, project, repoRoot, dartEntry, files }. `files[].kind` drives
 * the writer's per-surface no-clobber/merge behavior.
 */
function build({ scope, project, repoRoot }) {
  const dartEntry = mcp.buildDartEntry(serverPath(repoRoot), project);
  const workflowYaml = readWorkflowYaml(repoRoot);
  const digestText = renderDigestText(repoRoot, project);

  const files = [
    { rel: mcp.relPath(), kind: 'mcp-json', dartEntry },
    { rel: path.join('steering', 'dart-workflow.md'), kind: 'steering', content: steering.renderWorkflow(workflowYaml) },
    { rel: path.join('steering', 'dart-team.md'), kind: 'steering', content: steering.renderTeam(repoRoot) },
    { rel: path.join('steering', 'dart-digest.md'), kind: 'steering', content: steering.renderDigestSteering() },
    { rel: path.join('steering', '.dart', 'digest.md'), kind: 'digest', content: digestText + '\n' },
    { rel: path.join('agents', 'dart.json'), kind: 'agent-json', dartEntry },
  ];

  return { scope, project, repoRoot, dartEntry, files };
}

module.exports = { build, serverPath };
