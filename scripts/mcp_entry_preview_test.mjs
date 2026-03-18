import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildInventoryPacket,
  buildSchemaPacket,
  validatePacket
} from './mcp_entry_preview.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_COMMAND = process.env.NODE_BINARY || process.execPath;

function baseOptions() {
  return {
    taskId: 'p3-3-mcp-first-packet-entry-v1',
    taskTitle: 'Define the first MCP entry packet',
    taskPath: 'plans/p3-3-mcp-first-packet-entry-v1.md',
    owner: 'qxiaohu',
    skillsPacketPath: 'plans/p3-2-skills-recall-v1.md',
    mcporterSkillPath: 'D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md',
    cwd: 'qxiaohu-erliang-collab'
  };
}

function runNodeResult(args, cwd = REPO_ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_COMMAND, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('inventory packet treats zero configured servers as a first-class stop outcome', () => {
  const packet = buildInventoryPacket(
    baseOptions(),
    {
      mode: 'list',
      counts: {
        ok: 0,
        auth: 0,
        offline: 0,
        http: 0,
        error: 0
      },
      servers: []
    },
    'command:mcporter list --json'
  );

  assert.equal(packet.mcp_target.server_name, null);
  assert.equal(packet.mcp_target.selector_confidence, 'missing');
  assert.equal(packet.outcome.status, 'needs-server-selector');
  assert.equal(packet.outcome.reason, 'no-configured-servers');
  assert.equal(packet.preflight_command.command, 'mcporter list --json');
  assert.equal(packet.observed_signal.server_count, 0);
  assert.deepEqual(packet.observed_signal.server_names, []);
  assert.deepEqual(validatePacket(packet), {
    ok: true,
    checks: ['active-item-shape-ok', 'boundary-flags-ok', 'stop-conditions-ok', 'inspect-first-command-ok'],
    errors: []
  });
});

test('inventory packet keeps configured server names without selecting one', () => {
  const packet = buildInventoryPacket(
    baseOptions(),
    {
      mode: 'list',
      counts: {
        ok: 2,
        auth: 0,
        offline: 0,
        http: 0,
        error: 0
      },
      servers: [
        { name: 'linear' },
        { id: 'github' }
      ]
    },
    'file:inventory.json'
  );

  assert.equal(packet.mcp_target.server_name, null);
  assert.equal(packet.mcp_target.selector_confidence, 'inferred-from-config-list');
  assert.equal(packet.outcome.reason, 'server-selection-required');
  assert.deepEqual(packet.observed_signal.server_names, ['linear', 'github']);
  assert.equal(packet.expected_preflight_signal.kind, 'configured-server-list');
});

test('schema packet stays inspect-first and summarizes the schema surface', () => {
  const packet = buildSchemaPacket(
    baseOptions(),
    'linear',
    {
      server: 'linear',
      tools: [
        { name: 'list_issues' },
        { name: 'create_issue' },
        { name: 'get_issue' }
      ],
      resources: []
    },
    'file:linear-schema.json'
  );

  assert.equal(packet.mcp_target.server_name, 'linear');
  assert.equal(packet.mcp_target.selector_confidence, 'named');
  assert.equal(packet.preflight_command.command, 'mcporter list linear --schema --json');
  assert.equal(packet.observed_signal.kind, 'server-schema');
  assert.equal(packet.observed_signal.tool_count, 3);
  assert.deepEqual(packet.observed_signal.top_level_keys, ['resources', 'server', 'tools']);
  assert.equal(packet.outcome.status, 'schema-inspected');
  assert.equal(validatePacket(packet).ok, true);
});

test('cli preview reuses a saved inventory file and emits the validation marker', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mcp-entry-preview-'));
  const inventoryPath = path.join(tempRoot, 'inventory.json');

  try {
    await writeFile(
      inventoryPath,
      `${JSON.stringify({ mode: 'list', counts: { ok: 0, auth: 0, offline: 0, http: 0, error: 0 }, servers: [] }, null, 2)}\n`,
      'utf8'
    );

    const run = await runNodeResult([
      'scripts/mcp_entry_preview.mjs',
      'preview',
      '--task-title',
      'Define the first MCP entry packet',
      '--task-path',
      'plans/p3-3-mcp-first-packet-entry-v1.md',
      '--list-json-path',
      inventoryPath,
      '--validate'
    ]);

    assert.equal(run.code, 0);
    const packet = JSON.parse(run.stdout);
    assert.equal(packet.outcome.reason, 'no-configured-servers');
    assert.match(run.stderr, /mcp-entry-packet-ok/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('cli preview reuses a saved schema file for the named-server path', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mcp-entry-schema-'));
  const schemaPath = path.join(tempRoot, 'schema.json');

  try {
    await writeFile(
      schemaPath,
      `${JSON.stringify({ tools: [{ name: 'search' }, { name: 'read' }], resources: [] }, null, 2)}\n`,
      'utf8'
    );

    const run = await runNodeResult([
      'scripts/mcp_entry_preview.mjs',
      'preview',
      '--task-title',
      'Inspect the demo server schema',
      '--task-path',
      'plans/p3-3-mcp-first-packet-entry-v1.md',
      '--server',
      'demo',
      '--schema-json-path',
      schemaPath,
      '--validate'
    ]);

    assert.equal(run.code, 0);
    const packet = JSON.parse(run.stdout);
    assert.equal(packet.mcp_target.server_name, 'demo');
    assert.equal(packet.observed_signal.tool_count, 2);
    assert.match(run.stderr, /mcp-entry-packet-ok/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
