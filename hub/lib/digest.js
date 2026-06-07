#!/usr/bin/env node
'use strict';
/*
 * The canonical, overlay-aware workflow-state digest.
 *
 * Reuses hub/lib/state.js so the hub board, this CLI, and the memory SessionStart
 * hook (which shells out to `--text`) all project the SAME state.
 *
 *   node hub/lib/digest.js [projectDir] [--json|--text]
 */
const path = require('node:path');
const { buildState } = require('./state');

function renderText(st) {
  if (!st.tickets.length) {
    return `## Project Workflow State\nPreset: **${st.preset}**. No tickets in the ledger yet. Consult the workflow-engine before development.`;
  }
  const lines = [
    '## Project Workflow State (from files — authoritative)',
    `Preset: **${st.preset}**. ${st.tickets.length} ticket(s). Follow the workflow-engine gates before advancing any of them.`,
    '',
  ];
  for (const t of st.tickets) {
    const who = t.assignee ? ` · ${t.assignee}` : t.expectedOwner ? ` · (${t.expectedOwner})` : '';
    const done = t.status === 'done';
    const rejected = done ? [] : t.gates.filter((g) => g.state === 'rejected').map((g) => g.name);
    const pending = done ? [] : t.gates.filter((g) => g.state === 'pending' && g.required).map((g) => g.name);
    const flags = [];
    if (rejected.length) flags.push(`REJECTED: ${rejected.join(', ')}`);
    if (pending.length) flags.push(`pending: ${pending.join(', ')}`);
    const tail = flags.length ? ` — ${flags.join('; ')}` : '';
    lines.push(`- **${t.id}** · ${t.stage}${who} · ${t.status} — ${t.title}${tail}`);
  }
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((a) => !a.startsWith('-')) || process.cwd());
  const st = buildState(dir);
  if (args.includes('--json')) process.stdout.write(JSON.stringify(st, null, 2) + '\n');
  else process.stdout.write(renderText(st) + '\n');
}

module.exports = { renderText };
