'use strict';
/*
 * Renders the DART-scoped steering file set from the SAME sources of truth:
 * `claude/workflow/workflow.yaml` (+ the workflow-engine posture) and the agent
 * skills' SKILL.md front-matter. Each DART steering file carries a SENTINEL
 * marker comment so re-runs update only DART-managed files; a same-named NON-DART
 * file (no sentinel) is refused by the writer, never overwritten.
 *
 * Steering contains no credentials — only workflow/skills text and (via the
 * transcluded `.dart/digest.md`) the digest's directive rows, which are surfaced
 * as fence-escaped QUOTED DATA by the unchanged hub renderer.
 */
const fs = require('node:fs');
const path = require('node:path');

/** The marker that identifies a DART-managed steering/agent file. */
const SENTINEL = '<!-- dart:managed do-not-edit (regenerate with: node kiro/generate.js) -->';

/** The DART-scoped transclusion target — dot-scoped, DART-owned, never a user file. */
const DIGEST_TRANSCLUSION = '#[[file:.dart/digest.md]]';

function frontMatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  lines.push('---');
  return lines.join('\n');
}

/** Prefix a DART-managed steering body with its front-matter + sentinel. */
function dartFile(inclusion, body) {
  return `${frontMatter({ inclusion })}\n${SENTINEL}\n\n${body}\n`;
}

/** Read the `preset:` value from workflow.yaml (a fact, not a re-parse of the whole file). */
function readPreset(workflowYaml) {
  const m = /^preset:\s*([A-Za-z0-9_-]+)/m.exec(workflowYaml);
  return m ? m[1] : 'solo';
}

/**
 * `dart-workflow.md` — the gates/preset/proportionality posture, always included.
 * Rendered from workflow.yaml facts; the body defers to the workflow-engine skill
 * for the authoritative classification (no fork of the engine logic).
 */
function renderWorkflow(workflowYaml) {
  const preset = readPreset(workflowYaml);
  const body = [
    '# DART — workflow & gates',
    '',
    `This project uses the AI Dev Team (DART) workflow. Active preset: **${preset}**.`,
    '',
    'Before any development task and before every handoff, consult the workflow-engine',
    'skill: it classifies the change (trivial / small / standard / significant), decides',
    'which approval gates apply, and may refuse to proceed past an unmet gate. Process is',
    'proportional — a typo is not a feature.',
    '',
    '## Gates (set as ledger labels; security gates are a safety override, never skipped)',
    '- ARCH_APPROVED · SECOPS_APPROVED · DESIGN_APPROVED · APPROVAL_GATE',
    '- CODE_REVIEWED · PERF_OK · VERIFIED · RELIABILITY_OK',
    '',
    'Tickets and docs are file-based by default (Backlog.md + a markdown KB). The active',
    'workflow and preset live in `claude/workflow/workflow.yaml` (overridable per project).',
  ].join('\n');
  return dartFile('always', body);
}

/** Parse the `name:` and `description:` from a SKILL.md YAML front-matter block. */
function parseSkillFrontMatter(text) {
  const fm = /^---\s*\n([\s\S]*?)\n---/m.exec(text);
  if (!fm) return null;
  const block = fm[1];
  const name = /^name:\s*(.+)$/m.exec(block);
  const desc = /^description:\s*(.+)$/m.exec(block);
  if (!name) return null;
  let description = desc ? desc[1].trim() : '';
  if (description.startsWith('"') && description.endsWith('"')) {
    description = description.slice(1, -1);
  }
  return { name: name[1].trim(), description };
}

/** Collect every skill's {name, description} from claude/skills, in stable order. */
function collectSkills(repoRoot) {
  const root = path.join(repoRoot, 'claude', 'skills');
  const found = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name === 'SKILL.md') {
        const fm = parseSkillFrontMatter(fs.readFileSync(p, 'utf8'));
        if (fm) found.push(fm);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found;
}

/** `dart-team.md` — the compact agent-team roster, always included. */
function renderTeam(repoRoot) {
  const skills = collectSkills(repoRoot);
  const rows = skills.map((s) => `- **${s.name}** — ${s.description}`);
  const body = ['# DART — agent team', '', 'The specialist agents available in this project:', '', ...rows].join('\n');
  return dartFile('always', body);
}

/** `dart-digest.md` — transcludes the live, DART-owned digest, always included. */
function renderDigestSteering() {
  const body = [
    '# DART — live workflow state',
    '',
    'The current ticket / stage / gate state for this project (refreshed each turn):',
    '',
    DIGEST_TRANSCLUSION,
  ].join('\n');
  return dartFile('always', body);
}

/** True when an on-disk file is DART-managed (carries the sentinel). */
function isDartManaged(body) {
  return typeof body === 'string' && body.includes(SENTINEL);
}

module.exports = {
  SENTINEL,
  DIGEST_TRANSCLUSION,
  renderWorkflow,
  renderTeam,
  renderDigestSteering,
  collectSkills,
  parseSkillFrontMatter,
  isDartManaged,
};
