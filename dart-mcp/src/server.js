#!/usr/bin/env node
'use strict';
/*
 * DART write-back MCP server — stdio transport.
 *
 * A thin wiring layer over the pure tool handlers. It binds ONE project at spawn (cwd or
 * a launch arg), registers each tool with the MCP SDK, and routes every call to the pure
 * handler in handlers.js, which delegates 1:1 to the hub control plane (api.handle).
 *
 * Transport is stdio ONLY: the parent process (the main tool) spawns this server and owns
 * the pipe. Nothing binds a port or listens on a socket — a remote/cross-host caller is
 * structurally impossible. There is no X-AIDT/guard layer here because the network threat
 * class it defends does not exist on stdio; any future HTTP transport MUST reuse the hub's
 * guard.writeAllowed unchanged with allowRemote=false (recorded as a binding forward rule).
 *
 * Secrets are env-only: no tool accepts a credential, and the server never logs tool
 * argument bodies or env values. stderr carries only a terse, body-free bind line.
 */
const { TOOLS, invoke } = require('./tools');
const { resolveBoundProject } = require('./bind-project');

// Lift a plain field descriptor into a Zod schema using the SDK's bundled zod. Loaded
// lazily so the tool→api.handle mapping stays testable without the live transport/zod.
function toZodShape(input, z) {
  const shape = {};
  for (const [name, spec] of Object.entries(input || {})) {
    let s;
    if (spec.kind === 'boolean') s = z.boolean();
    else if (spec.kind === 'string[]') s = z.array(z.string());
    else s = z.string();
    if (spec.description) s = s.describe(spec.description);
    if (!spec.required) s = s.optional();
    shape[name] = s;
  }
  return shape;
}

// Shape a hub `{ code, payload }` result into an MCP tool result. The payload is returned
// as quoted JSON data; an error/refusal/conflict is surfaced as text, never thrown into an
// execution path. No tool argument is echoed back.
function toToolResult({ code, payload }) {
  const isError = !(payload && payload.ok);
  return {
    isError,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload && typeof payload === 'object' ? payload : undefined,
    _meta: { code },
  };
}

function buildServer(projectDir, { McpServer, z }) {
  const server = new McpServer({ name: 'dart', version: '0.1.0' });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: toZodShape(tool.input, z) },
      async (args) => toToolResult(await invoke(tool.name, args, projectDir)),
    );
  }
  return server;
}

async function main() {
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { z } = require('zod');

  const projectDir = resolveBoundProject(process.argv.slice(2), process.cwd());
  const server = buildServer(projectDir, { McpServer, z });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Bind line carries only the resolved project basename — never tool args, never env.
  process.stderr.write(`dart-mcp bound to project: ${require('node:path').basename(projectDir)}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`dart-mcp failed to start: ${err && err.message ? err.message : 'unknown error'}\n`);
    process.exit(1);
  });
}

module.exports = { buildServer, toZodShape, toToolResult };
