import path from 'node:path';
import process from 'node:process';
import { access, readFile, writeFile } from 'node:fs/promises';

const DEFAULT_OPENCLAW_APP_ROOT = process.env.OPENCLAW_APP_ROOT || 'D:/openclaw/openclaw_app';
const DEFAULT_STATE_PATH = path.join('notes', 'startup-recovery-state.json');
const PACKET_SCHEMA_PATH = path.join('plans', 'p3-2-skills-recall-packet-schema-v1.json');

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(stripBom(raw));
}

function usage() {
  console.error([
    'Usage:',
    '  node scripts/skills_recall_preview.mjs preview [--owner <owner>] [--state-path <path>] [--active-item-id <id>] [--task-title <title>] [--task-path <path>] [--task-notes <text>] [--expected-artifacts <csv>] [--user-request <text>] [--explicit-recall] [--validate] [--write-packet <path>]',
    '  node scripts/skills_recall_preview.mjs validate [--owner <owner>] [--state-path <path>] [--packet-path <path>]',
    '  node scripts/skills_recall_preview.mjs review [--owner <owner>] [--state-path <path>] [--packet-path <path>]'
  ].join('\n'));
}

function parseArgs(args) {
  const options = {};
  const booleanFlags = new Set(['--explicit-recall', '--validate']);
  const valueFlags = new Set([
    '--owner',
    '--state-path',
    '--active-item-id',
    '--task-title',
    '--task-path',
    '--task-notes',
    '--expected-artifacts',
    '--user-request',
    '--packet-path',
    '--write-packet'
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (booleanFlags.has(key)) {
      options[key] = true;
      continue;
    }

    if (!valueFlags.has(key)) {
      throw new Error(`Unknown option: ${key}`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for option: ${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function splitList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolveSourceCandidates(sourcePath, repoRoot, workspaceRoot) {
  const trimmed = String(sourcePath || '').trim();
  if (!trimmed) {
    return [];
  }

  if (path.isAbsolute(trimmed)) {
    return [path.normalize(trimmed)];
  }

  const normalized = trimmed.replace(/[\\/]+/g, path.sep);
  const repoName = path.basename(repoRoot);
  const candidates = [
    path.resolve(repoRoot, normalized),
    path.resolve(workspaceRoot, normalized)
  ];

  const repoPrefix = `${repoName}${path.sep}`.toLowerCase();
  if (normalized.toLowerCase().startsWith(repoPrefix)) {
    candidates.push(path.resolve(workspaceRoot, normalized));
    candidates.push(path.resolve(repoRoot, normalized.slice(repoPrefix.length)));
  }

  return [...new Set(candidates.map((entry) => path.normalize(entry)))];
}

function parseTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function getActivityTimestamp(item) {
  return parseTimestamp(item.last_evidence_at)
    || parseTimestamp(item.state_changed_at)
    || parseTimestamp(item.created_at)
    || 0;
}

function getStallPriority(item) {
  if (item.stall_status === 'stalled') {
    return 0;
  }

  if (item.stall_status === 'watch') {
    return 1;
  }

  return 2;
}

function selectHottestOpenItem(items, owner) {
  const filtered = items
    .filter((item) => item.promise_status === 'pending' && item.state !== 'done')
    .filter((item) => !owner || item.owner === owner)
    .sort((left, right) => {
      const priorityDiff = getStallPriority(left) - getStallPriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return getActivityTimestamp(right) - getActivityTimestamp(left);
    });

  return filtered[0] || null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function buildInlineActiveItem(options) {
  const expectedArtifacts = splitList(options['--expected-artifacts']);
  const artifactHint = options['--task-path'] || expectedArtifacts[0] || null;
  const title = options['--task-title'] || path.basename(options['--task-path'] || artifactHint || 'task-context');
  const owner = options['--owner'] || 'unknown';
  const inlineId = [slugify(owner) || 'owner', slugify(title) || 'task-context'].filter(Boolean).join('-');

  return {
    source: 'inline-task-context',
    id: options['--active-item-id'] || inlineId,
    title,
    state: 'task-context',
    owner,
    notes: options['--task-notes'] || '',
    artifact_hint: artifactHint,
    expected_artifacts: expectedArtifacts,
    evidence_paths: [],
    evidence_commands: []
  };
}

function buildStateActiveItem(item) {
  const evidencePaths = Array.isArray(item.evidence)
    ? item.evidence.map((entry) => entry.path).filter(Boolean)
    : [];
  const evidenceCommands = Array.isArray(item.evidence)
    ? item.evidence.map((entry) => entry.command).filter(Boolean)
    : [];

  return {
    source: 'startup-state',
    id: item.id,
    title: item.title,
    state: item.state,
    owner: item.owner,
    notes: item.notes || '',
    artifact_hint: item.expected_artifacts?.[0] || evidencePaths[0] || null,
    expected_artifacts: Array.isArray(item.expected_artifacts) ? item.expected_artifacts : [],
    evidence_paths: evidencePaths,
    evidence_commands: evidenceCommands
  };
}

function buildContextFields(activeItem, options) {
  return [
    ['title', activeItem.title],
    ['notes', activeItem.notes],
    ['artifact_hint', activeItem.artifact_hint],
    ['expected_artifacts', activeItem.expected_artifacts.join(' ')],
    ['evidence_path', activeItem.evidence_paths.join(' ')],
    ['evidence_command', activeItem.evidence_commands.join(' ')],
    ['user_request', options['--user-request'] || ''],
    ['task_path', options['--task-path'] || '']
  ];
}

function matchFields(contextFields, keywords) {
  const lowerKeywords = keywords.map((entry) => entry.toLowerCase());
  const matchedFrom = [];
  const matchedKeywords = new Set();

  for (const [field, value] of contextFields) {
    const text = String(value || '').toLowerCase();
    if (!text) {
      continue;
    }

    let matchedHere = false;
    for (const keyword of lowerKeywords) {
      if (text.includes(keyword)) {
        matchedHere = true;
        matchedKeywords.add(keyword);
      }
    }

    if (matchedHere) {
      matchedFrom.push(field);
    }
  }

  return {
    matched_from: matchedFrom,
    matched_keywords: [...matchedKeywords]
  };
}

function selectTrigger(activeItem, options, contextFields) {
  if (activeItem.source === 'startup-state') {
    return 'active-item-resume';
  }

  if (activeItem.artifact_hint || activeItem.expected_artifacts.length > 0 || activeItem.evidence_paths.length > 0) {
    return 'artifact-path-match';
  }

  const domainMatch = matchFields(contextFields, [
    'feishu',
    'wiki',
    'docx',
    'share',
    'weather',
    'forecast',
    'temperature',
    'security',
    'hardening',
    'mcp',
    'skill',
    'oracle'
  ]);
  if (domainMatch.matched_from.length > 0) {
    return 'domain-or-tool-hint';
  }

  const protocolMatch = matchFields(contextFields, [
    'handoff',
    'review',
    'rework',
    'validate',
    'eta',
    '交接',
    '审核',
    '返工',
    '验证'
  ]);
  if (protocolMatch.matched_from.length > 0) {
    return 'mandatory-protocol-gap';
  }

  if (options['--explicit-recall']) {
    return 'explicit-user-pull';
  }

  return 'explicit-user-pull';
}

function buildAnchorCandidate(activeItem) {
  const anchorPath = activeItem.artifact_hint
    || activeItem.expected_artifacts[0]
    || activeItem.evidence_paths[0]
    || null;

  if (!anchorPath) {
    return null;
  }

  return {
    source_path: normalizeSlashes(anchorPath),
    source_kind: 'active-item-evidence',
    why_recalled: activeItem.source === 'startup-state'
      ? 'The recovered active item already points to this artifact, so it is the most trustworthy first anchor from startup recovery.'
      : 'The provided task context already names this artifact, so it becomes the first anchor for the bounded recall pass.',
    required_before_action: true,
    matched_from: activeItem.source === 'startup-state'
      ? ['expected_artifacts', 'evidence_path']
      : ['artifact_hint', 'task_path']
  };
}

function buildLocalCandidate(activeItem, options) {
  const contextFields = buildContextFields(activeItem, options);
  const retrospectiveMatch = matchFields(contextFields, [
    'rework', 'eta', 'readable', 'push', 'stalled', '返工', '预计交付时间', '可读', '停滞'
  ]);
  if (retrospectiveMatch.matched_from.length > 0) {
    return {
      source_path: 'outputs/stage3-retrospective-v1.md',
      source_kind: 'collab-runbook',
      why_recalled: 'The task mentions rework and execution-discipline risks, so the retrospective guardrails are the best local protocol to surface before acting.',
      required_before_action: true,
      matched_from: retrospectiveMatch.matched_from
    };
  }

  const checklistMatch = matchFields(contextFields, [
    'handoff', 'validate', 'verification', 'known issues', 'next owner', 'work log', 'files changed', '交接', '审核', '验证'
  ]);
  if (checklistMatch.matched_from.length > 0) {
    return {
      source_path: 'outputs/execution-checklist-v2.md',
      source_kind: 'collab-runbook',
      why_recalled: 'The task wording asks for validation and handoff-ready output, so the standard execution checklist is the most relevant reusable runbook.',
      required_before_action: true,
      matched_from: checklistMatch.matched_from
    };
  }

  const toolsMatch = matchFields(contextFields, [
    'ssh', 'camera', 'tts', 'device', 'local setup', 'speaker'
  ]);
  if (toolsMatch.matched_from.length > 0) {
    return {
      source_path: 'TOOLS.md',
      source_kind: 'workspace-note',
      why_recalled: 'The task points at host-specific tooling, so local environment notes should be checked before action.',
      required_before_action: true,
      matched_from: toolsMatch.matched_from
    };
  }

  const collabMatch = matchFields(contextFields, [
    'qxiaohu', 'erliang', 'collab', 'collaboration', 'memory', 'plans/', 'notes/', 'outputs/', 'scripts/', '交接', '协作', '计划'
  ]);
  if (collabMatch.matched_from.length > 0 || String(activeItem.artifact_hint || '').includes('/')) {
    return {
      source_path: 'memory/qxiaohu-collab-rules.json',
      source_kind: 'workspace-note',
      why_recalled: 'The task lives in the shared collaboration flow, so the structured collaboration defaults and handoff rules are the smallest useful operating contract to recall.',
      required_before_action: true,
      matched_from: collabMatch.matched_from.length > 0 ? collabMatch.matched_from : ['artifact_hint']
    };
  }

  const agentsMatch = matchFields(contextFields, [
    'startup', 'workspace', 'memory', 'handoff', 'plans', 'notes', '执行'
  ]);
  if (agentsMatch.matched_from.length > 0) {
    return {
      source_path: 'AGENTS.md',
      source_kind: 'workspace-note',
      why_recalled: 'The task depends on workspace operating rules, so the startup contract in AGENTS.md is the best fallback local note to surface.',
      required_before_action: true,
      matched_from: agentsMatch.matched_from
    };
  }

  return null;
}

function getInstalledSkills() {
  const skillRoot = path.join(DEFAULT_OPENCLAW_APP_ROOT, 'node_modules', 'openclaw');
  return [
    {
      id: 'feishu-doc',
      sourcePath: path.join(skillRoot, 'extensions', 'feishu', 'skills', 'feishu-doc', 'SKILL.md'),
      keywords: ['feishu doc', 'feishu docs', 'cloud doc', 'cloud docs', 'docx link', 'docx links']
    },
    {
      id: 'feishu-drive',
      sourcePath: path.join(skillRoot, 'extensions', 'feishu', 'skills', 'feishu-drive', 'SKILL.md'),
      keywords: ['cloud storage', 'drive', 'folder', 'folders', 'cloud space']
    },
    {
      id: 'feishu-perm',
      sourcePath: path.join(skillRoot, 'extensions', 'feishu', 'skills', 'feishu-perm', 'SKILL.md'),
      keywords: ['sharing', 'permissions', 'permission', 'collaborator', 'collaborators', 'access change', 'share access']
    },
    {
      id: 'feishu-wiki',
      sourcePath: path.join(skillRoot, 'extensions', 'feishu', 'skills', 'feishu-wiki', 'SKILL.md'),
      keywords: ['knowledge base', 'wiki link', 'wiki']
    },
    {
      id: 'weather',
      sourcePath: path.join(skillRoot, 'skills', 'weather', 'SKILL.md'),
      keywords: ['weather', 'forecast', 'temperature']
    },
    {
      id: 'healthcheck',
      sourcePath: path.join(skillRoot, 'skills', 'healthcheck', 'SKILL.md'),
      keywords: ['security audit', 'hardening', 'exposure review', 'firewall', 'ssh', 'version status']
    },
    {
      id: 'mcporter',
      sourcePath: path.join(skillRoot, 'skills', 'mcporter', 'SKILL.md'),
      keywords: ['mcp server', 'mcp tool', 'mcp config', 'mcp']
    },
    {
      id: 'oracle',
      sourcePath: path.join(skillRoot, 'skills', 'oracle', 'SKILL.md'),
      keywords: ['oracle cli', 'file bundling', 'engines', 'oracle']
    },
    {
      id: 'skill-creator',
      sourcePath: path.join(skillRoot, 'skills', 'skill-creator', 'SKILL.md'),
      keywords: ['create a skill', 'author a skill', 'improve this skill', 'audit the skill', 'skill.md']
    },
    {
      id: 'clawhub',
      sourcePath: path.join(skillRoot, 'skills', 'clawhub', 'SKILL.md'),
      keywords: ['clawhub', 'publish skill', 'install skill', 'update skill']
    }
  ];
}

async function buildSkillCandidate(activeItem, options) {
  const contextFields = buildContextFields(activeItem, options);
  const matches = [];

  for (const skill of getInstalledSkills()) {
    const hit = matchFields(contextFields, skill.keywords);
    if (hit.matched_from.length === 0) {
      continue;
    }

    if (!(await pathExists(skill.sourcePath))) {
      continue;
    }

    matches.push({
      skill,
      matched_from: hit.matched_from,
      matched_keywords: hit.matched_keywords
    });
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => {
    const keywordDiff = right.matched_keywords.length - left.matched_keywords.length;
    if (keywordDiff !== 0) {
      return keywordDiff;
    }

    return right.skill.id.length - left.skill.id.length;
  });

  const best = matches[0];
  return {
    source_path: normalizeSlashes(best.skill.sourcePath),
    source_kind: 'installed-skill',
    why_recalled: `The task text mentions ${best.matched_keywords.join(', ')}, which maps to the installed ${best.skill.id} skill.`,
    required_before_action: true,
    matched_from: best.matched_from
  };
}

function buildOutputActiveItem(activeItem) {
  return compactObject({
    id: activeItem.id,
    title: activeItem.title,
    state: activeItem.state,
    owner: activeItem.owner,
    artifact_hint: activeItem.artifact_hint ? normalizeSlashes(activeItem.artifact_hint) : null,
    notes: activeItem.notes || undefined,
    expected_artifacts: activeItem.expected_artifacts.length > 0
      ? activeItem.expected_artifacts.map((entry) => normalizeSlashes(entry))
      : undefined,
    evidence_paths: activeItem.evidence_paths.length > 0
      ? activeItem.evidence_paths.map((entry) => normalizeSlashes(entry))
      : undefined,
    evidence_commands: activeItem.evidence_commands.length > 0 ? activeItem.evidence_commands : undefined
  });
}

function decorateCandidates(candidates) {
  return candidates
    .filter(Boolean)
    .slice(0, 3)
    .map((candidate, index) => compactObject({
      ...candidate,
      priority_index: index
    }));
}

async function buildPacket(options, repoRoot) {
  const workspaceRoot = path.dirname(repoRoot);
  const statePath = path.resolve(repoRoot, options['--state-path'] || DEFAULT_STATE_PATH);
  let activeItem = null;

  if (await pathExists(statePath)) {
    const state = await loadJson(statePath);
    const items = Array.isArray(state.items) ? state.items : [];
    const chosen = options['--active-item-id']
      ? items.find((item) => item.id === options['--active-item-id']) || null
      : selectHottestOpenItem(items, options['--owner']);
    if (chosen) {
      activeItem = buildStateActiveItem(chosen);
    }
  }

  if (!activeItem) {
    activeItem = buildInlineActiveItem(options);
  }

  if (!activeItem.artifact_hint && activeItem.expected_artifacts.length === 0 && activeItem.source !== 'startup-state') {
    throw new Error('Need an active startup item or a task path/expected artifact to anchor the recall preview.');
  }

  const contextFields = buildContextFields(activeItem, options);
  const trigger = selectTrigger(activeItem, options, contextFields);

  const candidates = [];
  const anchor = buildAnchorCandidate(activeItem);
  if (anchor) {
    candidates.push(anchor);
  }

  const local = buildLocalCandidate(activeItem, options);
  if (local && !candidates.some((entry) => entry.source_path === local.source_path)) {
    candidates.push(local);
  }

  const skill = await buildSkillCandidate(activeItem, options);
  if (skill && !candidates.some((entry) => entry.source_path === skill.source_path)) {
    candidates.push(skill);
  }

  return {
    trigger,
    active_item: buildOutputActiveItem(activeItem),
    recall_candidates: decorateCandidates(candidates),
    boundary: {
      startup_recovery_status: activeItem.source === 'startup-state'
        ? 'already decided by P3.1'
        : 'task context supplied directly; no startup state change performed',
      does_not_update_promise_state: true,
      does_not_override_hottest_item: true,
      does_not_start_external_actions: true
    }
  };
}

async function loadPacketSchema(repoRoot) {
  return loadJson(path.resolve(repoRoot, PACKET_SCHEMA_PATH));
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function pushExtraKeyErrors(errors, value, allowedKeys, label) {
  if (!ensureObject(value)) {
    return;
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      errors.push(`unexpected ${label}.${key}`);
    }
  }
}

function pushMissingKeyErrors(errors, value, requiredKeys, label) {
  if (!ensureObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      errors.push(`missing ${label}.${key}`);
    }
  }
}

function pushStringError(errors, value, label, allowNull = false) {
  if (allowNull && value === null) {
    return;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string${allowNull ? ' or null' : ''}`);
  }
}

function pushStringArrayErrors(errors, value, label, { minItems = 0 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }

  if (value.length < minItems) {
    errors.push(`${label} must contain at least ${minItems} item(s)`);
  }

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      errors.push(`${label}[${index}] must be a non-empty string`);
    }
  }
}

async function validatePacket(packet, context, schema) {
  const repoRoot = context.repoRoot;
  const workspaceRoot = path.dirname(repoRoot);
  const owner = context.owner || packet?.active_item?.owner || null;
  const statePath = path.resolve(repoRoot, context.statePath || DEFAULT_STATE_PATH);
  const errors = [];
  const checks = [];

  const topAllowed = Object.keys(schema.properties || {});
  const topRequired = Array.isArray(schema.required) ? schema.required : [];
  const activeSchema = schema.$defs?.activeItem || {};
  const activeAllowed = Object.keys(activeSchema.properties || {});
  const activeRequired = Array.isArray(activeSchema.required) ? activeSchema.required : [];
  const recallSchema = schema.$defs?.recallCandidate || {};
  const recallAllowed = Object.keys(recallSchema.properties || {});
  const recallRequired = Array.isArray(recallSchema.required) ? recallSchema.required : [];
  const recallKinds = new Set(recallSchema.properties?.source_kind?.enum || []);
  const boundarySchema = schema.$defs?.boundary || {};
  const boundaryAllowed = Object.keys(boundarySchema.properties || {});
  const boundaryRequired = Array.isArray(boundarySchema.required) ? boundarySchema.required : [];
  const allowedTriggers = new Set(schema.$defs?.trigger?.enum || []);

  {
    const before = errors.length;

    if (!ensureObject(packet)) {
      errors.push('packet must be an object');
    } else {
      pushExtraKeyErrors(errors, packet, topAllowed, 'packet');
      pushMissingKeyErrors(errors, packet, topRequired, 'packet');

      if ('trigger' in packet && !allowedTriggers.has(packet.trigger)) {
        errors.push(`trigger must be one of: ${[...allowedTriggers].join(', ')}`);
      }

      pushExtraKeyErrors(errors, packet.active_item, activeAllowed, 'active_item');
      pushMissingKeyErrors(errors, packet.active_item, activeRequired, 'active_item');
      if (ensureObject(packet.active_item)) {
        pushStringError(errors, packet.active_item.id, 'active_item.id');
        pushStringError(errors, packet.active_item.title, 'active_item.title');
        pushStringError(errors, packet.active_item.state, 'active_item.state');
        pushStringError(errors, packet.active_item.owner, 'active_item.owner');
        pushStringError(errors, packet.active_item.artifact_hint, 'active_item.artifact_hint', true);

        if ('notes' in packet.active_item && typeof packet.active_item.notes !== 'string') {
          errors.push('active_item.notes must be a string');
        }
        if ('expected_artifacts' in packet.active_item) {
          pushStringArrayErrors(errors, packet.active_item.expected_artifacts, 'active_item.expected_artifacts');
        }
        if ('evidence_paths' in packet.active_item) {
          pushStringArrayErrors(errors, packet.active_item.evidence_paths, 'active_item.evidence_paths');
        }
        if ('evidence_commands' in packet.active_item) {
          pushStringArrayErrors(errors, packet.active_item.evidence_commands, 'active_item.evidence_commands');
        }
      }

      if (!Array.isArray(packet.recall_candidates)) {
        errors.push('recall_candidates must be an array');
      } else {
        if (packet.recall_candidates.length > 3) {
          errors.push(`recall_candidates must contain at most 3 entries, found ${packet.recall_candidates.length}`);
        }

        let skillCount = 0;
        for (const [index, item] of packet.recall_candidates.entries()) {
          pushExtraKeyErrors(errors, item, recallAllowed, `recall_candidates[${index}]`);
          pushMissingKeyErrors(errors, item, recallRequired, `recall_candidates[${index}]`);
          if (!ensureObject(item)) {
            continue;
          }

          pushStringError(errors, item.source_path, `recall_candidates[${index}].source_path`);
          if (!recallKinds.has(item.source_kind)) {
            errors.push(`recall_candidates[${index}].source_kind must be one of: ${[...recallKinds].join(', ')}`);
          }
          pushStringError(errors, item.why_recalled, `recall_candidates[${index}].why_recalled`);
          if (typeof item.why_recalled === 'string' && item.why_recalled.trim().length < 12) {
            errors.push(`recall_candidates[${index}].why_recalled is too short to be actionable`);
          }
          if (typeof item.required_before_action !== 'boolean') {
            errors.push(`recall_candidates[${index}].required_before_action must be boolean`);
          }
          pushStringArrayErrors(errors, item.matched_from, `recall_candidates[${index}].matched_from`, { minItems: 1 });

          if ('priority_index' in item) {
            if (!Number.isInteger(item.priority_index) || item.priority_index < 0 || item.priority_index > 2) {
              errors.push(`recall_candidates[${index}].priority_index must be an integer from 0 to 2`);
            }
          }

          if ('source_tier' in item) {
            const tiers = new Set(recallSchema.properties?.source_tier?.enum || []);
            if (!tiers.has(item.source_tier)) {
              errors.push(`recall_candidates[${index}].source_tier must be one of: ${[...tiers].join(', ')}`);
            }
          }

          if (item.source_kind === 'installed-skill') {
            skillCount += 1;
          }

          if (typeof item.why_recalled === 'string' && /useful context|probably relevant/i.test(item.why_recalled)) {
            errors.push(`recall_candidates[${index}].why_recalled uses banned generic phrasing`);
          }
        }

        if (skillCount > 1) {
          errors.push(`recall_candidates must contain at most 1 installed-skill, found ${skillCount}`);
        }
      }

      pushExtraKeyErrors(errors, packet.boundary, boundaryAllowed, 'boundary');
      pushMissingKeyErrors(errors, packet.boundary, boundaryRequired, 'boundary');
      if (ensureObject(packet.boundary)) {
        pushStringError(errors, packet.boundary.startup_recovery_status, 'boundary.startup_recovery_status');
        if (packet.boundary.does_not_update_promise_state !== true) {
          errors.push('boundary.does_not_update_promise_state must be true');
        }
        if (packet.boundary.does_not_override_hottest_item !== true) {
          errors.push('boundary.does_not_override_hottest_item must be true');
        }
        if (packet.boundary.does_not_start_external_actions !== true) {
          errors.push('boundary.does_not_start_external_actions must be true');
        }
      }
    }

    if (errors.length === before) {
      checks.push('packet-schema-shape-ok');
    }
  }

  {
    const before = errors.length;

    if (Array.isArray(packet?.recall_candidates)) {
      for (const [index, item] of packet.recall_candidates.entries()) {
        if (!ensureObject(item) || typeof item.source_path !== 'string' || item.source_path.trim().length === 0) {
          continue;
        }

        const normalized = normalizeSlashes(item.source_path);
        if (path.basename(normalized).toLowerCase() === 'memory.md') {
          errors.push(`recall_candidates[${index}].source_path is blocked in shared/subagent review: ${item.source_path}`);
          continue;
        }

        const candidates = resolveSourceCandidates(item.source_path, repoRoot, workspaceRoot);
        let exists = false;
        for (const candidatePath of candidates) {
          if (await pathExists(candidatePath)) {
            exists = true;
            break;
          }
        }

        if (!exists) {
          errors.push(`recall_candidates[${index}].source_path does not exist: ${item.source_path}`);
        }
      }
    }

    if (errors.length === before) {
      checks.push('packet-source-paths-ok');
    }
  }

  {
    const before = errors.length;

    if (await pathExists(statePath)) {
      const state = await loadJson(statePath);
      const items = Array.isArray(state.items) ? state.items : [];
      const hottest = selectHottestOpenItem(items, owner);
      if (hottest) {
        if (packet?.active_item?.id !== hottest.id) {
          errors.push(`active_item.id does not match the hottest open item for ${owner || 'current owner'}`);
        }
        if (packet?.active_item?.title !== hottest.title) {
          errors.push(`active_item.title does not match the hottest open item for ${owner || 'current owner'}`);
        }
        if (errors.length === before) {
          checks.push('packet-anchor-ok');
        }
      } else {
        checks.push('packet-anchor-check-skipped-no-open-item');
      }
    } else {
      checks.push('packet-anchor-check-skipped-no-state-file');
    }
  }

  {
    const before = errors.length;
    const haystack = JSON.stringify(packet);
    const banned = ['cron', 'gateway', 'MCP implementation', 'delivery plumbing', 'read all plans', 'useful context', 'probably relevant'];
    for (const token of banned) {
      if (haystack.includes(token)) {
        errors.push(`packet contains banned scope-smuggle token: ${token}`);
      }
    }

    if (errors.length === before) {
      checks.push('packet-scope-clean');
    }
  }

  return {
    ok: errors.length === 0,
    schema_id: schema.$id || null,
    schema_path: normalizeSlashes(PACKET_SCHEMA_PATH),
    state_path: normalizeSlashes(path.relative(repoRoot, statePath) || '.'),
    packet_summary: {
      trigger: packet?.trigger || null,
      active_item_id: packet?.active_item?.id || null,
      active_item_owner: packet?.active_item?.owner || null,
      recall_candidate_count: Array.isArray(packet?.recall_candidates) ? packet.recall_candidates.length : null
    },
    checks,
    errors
  };
}

function hasCleanPriorityOrder(candidates) {
  const withPriority = candidates.filter((entry) => Number.isInteger(entry?.priority_index));
  if (withPriority.length === 0) {
    return true;
  }

  if (withPriority.length !== candidates.length) {
    return false;
  }

  return withPriority.every((entry, index) => entry.priority_index === index);
}

async function reviewPacket(packet, context, schema) {
  const validation = await validatePacket(packet, context, schema);
  const errors = [...validation.errors];
  const checks = [...validation.checks];
  const candidates = Array.isArray(packet?.recall_candidates)
    ? packet.recall_candidates.filter((entry) => ensureObject(entry))
    : [];
  const requiredCount = candidates.filter((entry) => entry.required_before_action === true).length;
  const installedSkillCount = candidates.filter((entry) => entry.source_kind === 'installed-skill').length;

  if (candidates.length === 0) {
    checks.push('review-no-extra-recall-packet-ok');
  } else {
    const first = candidates[0];
    if (typeof first.source_path === 'string' && first.source_path.trim().length > 0) {
      checks.push('review-first-read-clear');
    } else {
      errors.push('review requires the first recall candidate to name a readable source_path');
    }

    if (requiredCount > 0) {
      checks.push('review-required-source-coverage-ok');
    } else {
      errors.push('review expects at least one recall candidate with required_before_action=true');
    }

    if (hasCleanPriorityOrder(candidates)) {
      checks.push('review-order-clean');
    } else {
      errors.push('review expects priority_index values to stay aligned with packet order when present');
    }
  }

  return {
    ok: errors.length === 0,
    verdict: errors.length === 0 ? 'pass' : 'fail',
    schema_id: validation.schema_id,
    schema_path: validation.schema_path,
    state_path: validation.state_path,
    packet_summary: validation.packet_summary,
    review_summary: {
      candidate_count: candidates.length,
      first_read_source: candidates[0]?.source_path || null,
      review_order: candidates.map((entry) => entry.source_path),
      required_source_count: requiredCount,
      installed_skill_count: installedSkillCount
    },
    checks,
    errors
  };
}

async function writePacketToFile(packet, packetPath, repoRoot) {
  const resolvedPath = path.resolve(repoRoot, packetPath);
  await writeFile(resolvedPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

async function readStdinText() {
  if (process.stdin.isTTY) {
    return '';
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function readPacketFromInput(options, repoRoot) {
  if (options['--packet-path']) {
    const packetPath = path.resolve(repoRoot, options['--packet-path']);
    const raw = await readFile(packetPath, 'utf8');
    return JSON.parse(stripBom(raw));
  }

  const stdin = stripBom(await readStdinText()).trim();
  if (!stdin) {
    throw new Error('Need --packet-path or packet JSON on stdin for validate/review.');
  }

  return JSON.parse(stdin);
}

function formatValidationFailure(report) {
  return [
    'Skills Recall packet validation failed:',
    ...report.errors.map((entry) => `- ${entry}`)
  ].join('\n');
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseArgs(args);
  const repoRoot = process.cwd();

  if (command === 'preview') {
    const packet = await buildPacket(options, repoRoot);

    if (options['--validate']) {
      const schema = await loadPacketSchema(repoRoot);
      const report = await validatePacket(packet, {
        repoRoot,
        owner: options['--owner'] || packet.active_item.owner,
        statePath: options['--state-path'] || DEFAULT_STATE_PATH
      }, schema);
      if (!report.ok) {
        throw new Error(formatValidationFailure(report));
      }
      console.error(`skills-recall-packet-ok (${report.checks.join(', ')})`);
    }

    if (options['--write-packet']) {
      const writtenPath = await writePacketToFile(packet, options['--write-packet'], repoRoot);
      console.error(`skills-recall-packet-written (${normalizeSlashes(path.relative(repoRoot, writtenPath) || '.')})`);
    }

    process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    return;
  }

  if (command === 'validate') {
    const schema = await loadPacketSchema(repoRoot);
    const packet = await readPacketFromInput(options, repoRoot);
    const report = await validatePacket(packet, {
      repoRoot,
      owner: options['--owner'] || packet?.active_item?.owner || null,
      statePath: options['--state-path'] || DEFAULT_STATE_PATH
    }, schema);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'review') {
    const schema = await loadPacketSchema(repoRoot);
    const packet = await readPacketFromInput(options, repoRoot);
    const report = await reviewPacket(packet, {
      repoRoot,
      owner: options['--owner'] || packet?.active_item?.owner || null,
      statePath: options['--state-path'] || DEFAULT_STATE_PATH
    }, schema);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
