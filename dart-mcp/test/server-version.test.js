'use strict';
/*
 * The MCP server advertises a single source-of-truth version.
 *
 * buildServer() must report the version declared in package.json so a version bump in
 * the manifest cannot silently drift from the value the server announces to clients.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SERVER_VERSION, buildServer } = require('../src/server');

const PKG = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);

test('SERVER_VERSION is sourced from package.json (single source of truth)', () => {
  assert.equal(SERVER_VERSION, PKG.version);
});

test('buildServer advertises the package.json version to the MCP client', () => {
  const captured = {};
  const McpServer = class {
    constructor(opts) {
      captured.name = opts.name;
      captured.version = opts.version;
    }
    registerTool() {}
  };
  const z = {
    boolean: () => z,
    array: () => z,
    string: () => z,
    describe: () => z,
    optional: () => z,
  };
  buildServer('/tmp/project', { McpServer, z });
  assert.equal(captured.name, 'dart');
  assert.equal(captured.version, PKG.version);
});
