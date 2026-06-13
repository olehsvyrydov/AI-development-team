#!/usr/bin/env node
'use strict';
/*
 * kiro-cli `agentSpawn` shim — SessionStart-equivalent.
 *
 * It EXECs the EXISTING SessionStart hook module unchanged
 * (claude/memory/src/hooks/restore-context.ts); it does NOT re-implement the
 * digest/recall logic. Kiro's event JSON on STDIN ({hook_event_name, cwd,
 * session_id}) is passed straight through — the existing module reads `cwd`
 * (the same field name CC provides). Posture is inherited verbatim: read-only
 * w.r.t. the project, directives surfaced only as quoted DATA by the unchanged
 * renderer, and the module's own `exit 0` harness means a turn is never blocked.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HOOK_MODULE = path.resolve(__dirname, '..', '..', 'claude', 'memory', 'src', 'hooks', 'restore-context.ts');

const stdin = fs.readFileSync(0);
const res = spawnSync('node', ['--no-warnings', HOOK_MODULE], {
  input: stdin,
  stdio: ['pipe', 'inherit', 'inherit'],
});

process.exit(res.status == null ? 0 : res.status);
