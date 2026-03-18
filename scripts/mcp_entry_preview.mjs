import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_OWNER = 'qxiaohu';
const DEFAULT_TASK_PATH = 'plans/p3-3-mcp-first-packet-entry-v1.md';
const DEFAULT_SKILLS_PACKET_PATH = 'plans/p3-2-skills-recall-v1.md';
const DEFAULT_MCPORTER_SKILL_PATH = 'D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md';
const DEFAULT_CWD = 'qxiaohu-erliang-collab';

const REQUIRED_BOUNDARY = Object.freeze({
  does_not_mutate_mcporter_config: true,
  does_not_start_auth_flow: true,
  does_not_call_mutating_tool: true,
  does_not_override_p3_layers: true
});

function printUsage() {
  console.error(
    [
      'Usage:',
      '  node scripts/mcp_entry_preview.mjs preview [options]',
      '',
      'Options:',
      '  --task-title <title>           Active task title',
      '  --task-path <path>             Active task path (default: plans/p3-3-mcp-first-packet-entry-v1.md)',
      '  --task-id <id>                 Active task id (default: derived from task path)',
      '  --owner <owner>                Active owner (default: qxiaohu)',
      '  --server <name>                Configured server name to inspect',
      '  --list-json-path <path>        Reuse saved mcporter list JSON instead of running mcporter',
      '  --schema-json-path <path>      Reuse saved schema JSON instead of running mcporter',
      '  --skills-packet-path <path>    Skills Recall packet or anchor path',
      '  --mcporter-skill-path <path>   mcporter skill path',
      '  --cwd <path>                   Packet cwd label (default: qxiaohu-erliang-collab)',
      '  --validate                     Validate the emitted packet and print a marker to stderr'
    ].join('\n')
  );
}

function ensureString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function deriveTaskId(taskPath, taskTitle) {
  if (taskPath) {
    return path.basename(taskPath, path.extname(taskPath)).replace(/[^a-zA-Z0-9._-]+/g, '-');
  }
  return ensureString(taskTitle, 'task title').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command !== 'preview') {
    throw new Error(`Unsupported command: ${command}`);
  }

  const options = {
    command,
    owner: DEFAULT_OWNER,
    taskPath: DEFAULT_TASK_PATH,
    skillsPacketPath: DEFAULT_SKILLS_PACKET_PATH,
    mcporterSkillPath: DEFAULT_MCPORTER_SKILL_PATH,
    cwd: DEFAULT_CWD,
    validate: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--validate') {
      options.validate = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = rest[index + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }

    index += 1;
    switch (token) {
      case '--task-title':
        options.taskTitle = value;
        break;
      case '--task-path':
        options.taskPath = value;
        break;
      case '--task-id':
        options.taskId = value;
        break;
      case '--owner':
        options.owner = value;
        break;
      case '--server':
        options.server = value;
        break;
      case '--list-json-path':
        options.listJsonPath = value;
        break;
      case '--schema-json-path':
        options.schemaJsonPath = value;
        break;
      case '--skills-packet-path':
        options.skillsPacketPath = value;
        break;
      case '--mcporter-skill-path':
        options.mcporterSkillPath = value;
        break;
      case '--cwd':
        options.cwd = value;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  if (!options.taskTitle) {
    options.taskTitle = 'Inspect the first MCP entry path';
  }

  options.owner = ensureString(options.owner, 'owner');
  options.taskTitle = ensureString(options.taskTitle, 'task title');
  options.taskPath = ensureString(options.taskPath, 'task path');
  options.skillsPacketPath = ensureString(options.skillsPacketPath, 'skills packet path');
  options.mcporterSkillPath = ensureString(options.mcporterSkillPath, 'mcporter skill path');
  options.cwd = ensureString(options.cwd, 'cwd');
  options.taskId = options.taskId ? ensureString(options.taskId, 'task id') : deriveTaskId(options.taskPath, options.taskTitle);

  if (options.listJsonPath && options.server) {
    throw new Error('--list-json-path is only valid when --server is not set');
  }

  if (options.schemaJsonPath && !options.server) {
    throw new Error('--schema-json-path requires --server');
  }

  return options;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse ${label}: ${error.message}`);
  }
}

function extractServerName(entry) {
  if (typeof entry === 'string' && entry.trim() !== '') {
    return entry.trim();
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidates = [entry.name, entry.server, entry.id, entry.slug];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return null;
}

function summarizeList(listResult) {
  if (!listResult || typeof listResult !== 'object' || Array.isArray(listResult)) {
    throw new Error('mcporter list result must be a JSON object');
  }

  if (listResult.mode !== 'list') {
    throw new Error(`mcporter list result must include mode="list", received ${JSON.stringify(listResult.mode)}`);
  }

  if (!Array.isArray(listResult.servers)) {
    throw new Error('mcporter list result must include a servers array');
  }

  const serverNames = listResult.servers.map(extractServerName).filter(Boolean);
  return {
    mode: 'list',
    server_count: listResult.servers.length,
    server_names: serverNames,
    counts: listResult.counts && typeof listResult.counts === 'object' ? listResult.counts : null
  };
}

function detectToolCount(schemaResult) {
  if (!schemaResult || typeof schemaResult !== 'object' || Array.isArray(schemaResult)) {
    return null;
  }

  if (Array.isArray(schemaResult.tools)) {
    return schemaResult.tools.length;
  }

  if (schemaResult.tools && typeof schemaResult.tools === 'object') {
    return Object.keys(schemaResult.tools).length;
  }

  if (schemaResult.capabilities && Array.isArray(schemaResult.capabilities.tools)) {
    return schemaResult.capabilities.tools.length;
  }

  if (schemaResult.schema && Array.isArray(schemaResult.schema.tools)) {
    return schemaResult.schema.tools.length;
  }

  return null;
}

function summarizeSchema(serverName, schemaResult) {
  if (!schemaResult || typeof schemaResult !== 'object' || Array.isArray(schemaResult)) {
    throw new Error('mcporter schema result must be a JSON object');
  }

  return {
    kind: 'server-schema',
    server_name: ensureString(serverName, 'server name'),
    top_level_keys: Object.keys(schemaResult).sort(),
    tool_count: detectToolCount(schemaResult)
  };
}

function buildBasePacket(options) {
  return {
    entry_trigger: 'skills-recall-mcp-hit',
    active_item: {
      id: options.taskId,
      title: options.taskTitle,
      owner: options.owner,
      artifact_hint: options.taskPath
    },
    skills_packet_source: {
      packet_path: options.skillsPacketPath,
      mcporter_source_path: options.mcporterSkillPath,
      why_mcp_now: 'Skills Recall already narrowed the task to MCP, so the next step is inspect-first mcporter discovery before any tool call.'
    },
    stop_conditions: [
      'no configured server selected after the inventory step',
      'no configured servers available',
      'the task requires auth, config mutation, or ad-hoc server setup',
      'the next requested action is a mutating tool call rather than inspection',
      'P3.1 or P3.2 anchor drift is detected'
    ],
    boundary: { ...REQUIRED_BOUNDARY }
  };
}

function buildInventoryPacket(options, listResult, signalSource) {
  const summary = summarizeList(listResult);
  const hasServers = summary.server_count > 0;
  const selectorConfidence = hasServers ? 'inferred-from-config-list' : 'missing';
  const outcomeReason = hasServers ? 'server-selection-required' : 'no-configured-servers';

  return {
    ...buildBasePacket(options),
    mcp_target: {
      mode: 'configured-server-inspect',
      server_name: null,
      tool_name: null,
      selector_confidence: selectorConfidence
    },
    preflight_command: {
      command: 'mcporter list --json',
      cwd: options.cwd,
      expected_exit_code: 0
    },
    expected_preflight_signal: {
      kind: 'configured-server-list',
      must_be_json: true,
      minimum_success_rule: 'output.mode=list and output.servers is an array'
    },
    observed_signal: {
      kind: 'configured-server-list',
      signal_source: signalSource,
      ...summary
    },
    outcome: {
      status: 'needs-server-selector',
      reason: outcomeReason,
      next_step: hasServers ? 'Select one configured server, then run mcporter list <server> --schema --json in a later bounded packet.' : 'Stop here and treat missing configured servers as a prerequisite rather than forcing auth, config edits, or an ad-hoc server.'
    }
  };
}

function buildSchemaPacket(options, serverName, schemaResult, signalSource) {
  const normalizedServer = ensureString(serverName, 'server name');
  return {
    ...buildBasePacket(options),
    mcp_target: {
      mode: 'configured-server-inspect',
      server_name: normalizedServer,
      tool_name: null,
      selector_confidence: 'named'
    },
    preflight_command: {
      command: `mcporter list ${normalizedServer} --schema --json`,
      cwd: options.cwd,
      expected_exit_code: 0
    },
    expected_preflight_signal: {
      kind: 'server-schema',
      must_be_json: true,
      minimum_success_rule: 'output is a JSON object describing the selected server schema'
    },
    observed_signal: {
      signal_source: signalSource,
      ...summarizeSchema(normalizedServer, schemaResult)
    },
    outcome: {
      status: 'schema-inspected',
      reason: 'configured-server-schema-captured',
      next_step: 'Stop after schema inspection and hand off a later bounded packet before any mcporter call.'
    }
  };
}

async function loadJsonFromFile(filePath, label) {
  const absolutePath = path.resolve(REPO_ROOT, filePath);
  const raw = await readFile(absolutePath, 'utf8');
  return parseJson(raw, label);
}

function quoteWindowsArg(value) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function runCommand(commandArgs, cwd = REPO_ROOT) {
  return new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandArgs.map((value) => quoteWindowsArg(String(value))).join(' ')], {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      : spawn(commandArgs[0], commandArgs.slice(1), {
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

async function loadInventory(options) {
  if (options.listJsonPath) {
    return {
      signalSource: `file:${options.listJsonPath}`,
      payload: await loadJsonFromFile(options.listJsonPath, 'list JSON')
    };
  }

  const result = await runCommand(['mcporter', 'list', '--json'], REPO_ROOT);
  if (result.code !== 0) {
    throw new Error(result.stderr || `mcporter list --json failed with exit code ${result.code}`);
  }

  return {
    signalSource: 'command:mcporter list --json',
    payload: parseJson(result.stdout, 'mcporter list output')
  };
}

async function loadSchema(options) {
  if (options.schemaJsonPath) {
    return {
      signalSource: `file:${options.schemaJsonPath}`,
      payload: await loadJsonFromFile(options.schemaJsonPath, 'schema JSON')
    };
  }

  const result = await runCommand(['mcporter', 'list', options.server, '--schema', '--json'], REPO_ROOT);
  if (result.code !== 0) {
    throw new Error(result.stderr || `mcporter list ${options.server} --schema --json failed with exit code ${result.code}`);
  }

  return {
    signalSource: `command:mcporter list ${options.server} --schema --json`,
    payload: parseJson(result.stdout, 'mcporter schema output')
  };
}

function validatePacket(packet) {
  const checks = [];
  const errors = [];

  const requiredTopLevel = ['entry_trigger', 'active_item', 'skills_packet_source', 'mcp_target', 'preflight_command', 'expected_preflight_signal', 'observed_signal', 'outcome', 'stop_conditions', 'boundary'];
  for (const key of requiredTopLevel) {
    if (!(key in packet)) {
      errors.push(`missing ${key}`);
    }
  }

  const activeItem = packet.active_item || {};
  for (const key of ['id', 'title', 'owner', 'artifact_hint']) {
    if (!(key in activeItem) || typeof activeItem[key] !== 'string' || activeItem[key].trim() === '') {
      errors.push(`invalid active_item.${key}`);
    }
  }
  if (!errors.some((entry) => entry.startsWith('invalid active_item.'))) {
    checks.push('active-item-shape-ok');
  }

  const boundary = packet.boundary || {};
  for (const [key, expected] of Object.entries(REQUIRED_BOUNDARY)) {
    if (boundary[key] !== expected) {
      errors.push(`invalid boundary.${key}`);
    }
  }
  if (!errors.some((entry) => entry.startsWith('invalid boundary.'))) {
    checks.push('boundary-flags-ok');
  }

  if (!Array.isArray(packet.stop_conditions) || packet.stop_conditions.length < 5) {
    errors.push('invalid stop_conditions');
  } else {
    checks.push('stop-conditions-ok');
  }

  const mcpTarget = packet.mcp_target || {};
  if (mcpTarget.mode !== 'configured-server-inspect') {
    errors.push('invalid mcp_target.mode');
  }

  const preflight = packet.preflight_command || {};
  const expectedSignal = packet.expected_preflight_signal || {};
  const observedSignal = packet.observed_signal || {};
  if (mcpTarget.server_name == null) {
    if (preflight.command !== 'mcporter list --json') {
      errors.push('inventory packet must use mcporter list --json');
    }
    if (expectedSignal.kind !== 'configured-server-list') {
      errors.push('inventory packet must expect configured-server-list');
    }
    if (observedSignal.kind !== 'configured-server-list') {
      errors.push('inventory packet must observe configured-server-list');
    }
  } else if (typeof mcpTarget.server_name === 'string' && mcpTarget.server_name.trim() !== '') {
    const expectedCommand = `mcporter list ${mcpTarget.server_name} --schema --json`;
    if (preflight.command !== expectedCommand) {
      errors.push(`schema packet must use ${expectedCommand}`);
    }
    if (expectedSignal.kind !== 'server-schema') {
      errors.push('schema packet must expect server-schema');
    }
    if (observedSignal.kind !== 'server-schema') {
      errors.push('schema packet must observe server-schema');
    }
  } else {
    errors.push('invalid mcp_target.server_name');
  }

  if (!errors.some((entry) => entry.includes('packet must'))) {
    checks.push('inspect-first-command-ok');
  }

  return {
    ok: errors.length === 0,
    checks,
    errors
  };
}

async function preview(options) {
  if (options.server) {
    const schema = await loadSchema(options);
    return buildSchemaPacket(options, options.server, schema.payload, schema.signalSource);
  }

  const inventory = await loadInventory(options);
  return buildInventoryPacket(options, inventory.payload, inventory.signalSource);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const packet = await preview(options);
    if (options.validate) {
      const report = validatePacket(packet);
      if (!report.ok) {
        throw new Error(report.errors.join('; '));
      }
      console.error('mcp-entry-packet-ok');
    }
    process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export {
  DEFAULT_CWD,
  DEFAULT_MCPORTER_SKILL_PATH,
  DEFAULT_OWNER,
  DEFAULT_SKILLS_PACKET_PATH,
  DEFAULT_TASK_PATH,
  REQUIRED_BOUNDARY,
  buildInventoryPacket,
  buildSchemaPacket,
  detectToolCount,
  preview,
  summarizeList,
  summarizeSchema,
  validatePacket
};
