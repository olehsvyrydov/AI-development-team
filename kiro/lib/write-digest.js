'use strict';
/*
 * The digest writer wrapper. It runs the EXISTING digest CLI
 * (`node hub/lib/digest.js <project> --text`) and returns its output so the
 * generator can persist it to the DART-owned `.kiro/steering/.dart/digest.md`
 * that `dart-digest.md` transcludes. It does NOT fork the digest renderer: the
 * directive fence-escape is the unchanged `renderDirectiveData` exported by the
 * hub digest module, reused verbatim. Read-only w.r.t. the project.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { renderDirectiveData } = require('../../hub/lib/digest');

/** Tight deadline for the single digest child process. */
const DIGEST_TIMEOUT_MS = 2000;

/** Absolute path to the bundled digest CLI within the repo. */
function digestCliPath(repoRoot) {
  return path.join(repoRoot, 'hub', 'lib', 'digest.js');
}

/**
 * Render the live digest text for a project via the SAME overlay-aware CLI the
 * CC hook and hub board use. On any failure returns a minimal, safe placeholder
 * (never throws — the steering surface must degrade, not break).
 */
function renderDigestText(repoRoot, projectDir) {
  try {
    const out = execFileSync('node', [digestCliPath(repoRoot), projectDir, '--text'], {
      encoding: 'utf8',
      timeout: DIGEST_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch {
    /* hub unavailable / errored — degrade to a safe placeholder */
  }
  return '## Project Workflow State\nNo workflow state available. Consult the workflow-engine before development.';
}

/**
 * Expose the unchanged hub fence-escape so callers/tests can confirm a directive
 * body is surfaced as quoted DATA (a crafted closing fence is neutralized). This
 * is the SAME renderer the digest CLI already applies — re-exported, not re-implemented.
 */
function renderDirectiveLine(prompt) {
  return renderDirectiveData(prompt);
}

module.exports = { renderDigestText, renderDirectiveLine, digestCliPath };
