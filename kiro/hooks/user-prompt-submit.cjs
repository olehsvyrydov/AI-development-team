#!/usr/bin/env node
'use strict';
/*
 * kiro-cli `userPromptSubmit` shim — live-directive delivery.
 *
 * It EXECs the EXISTING UserPromptSubmit hook module unchanged
 * (claude/memory/src/hooks/live-directives.ts); it does NOT re-implement the
 * pending-directive / seen-file / fence-escape logic. Kiro's event JSON on STDIN
 * (cwd, session_id) maps 1:1; `transcript_path` is absent in Kiro, and the
 * existing module already degrades cleanly to the project-external session
 * seen-file. Posture is inherited verbatim: read-only w.r.t. the project,
 * directives surfaced only as quoted DATA, and the module's `exit 0` harness
 * means a prompt is never blocked.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HOOK_MODULE = path.resolve(__dirname, '..', '..', 'claude', 'memory', 'src', 'hooks', 'live-directives.ts');

const stdin = fs.readFileSync(0);
const res = spawnSync('node', ['--no-warnings', HOOK_MODULE], {
  input: stdin,
  stdio: ['pipe', 'inherit', 'inherit'],
});

process.exit(res.status == null ? 0 : res.status);
