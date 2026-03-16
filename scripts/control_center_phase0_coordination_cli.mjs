import path from 'node:path';
import process from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

async function readJson(jsonPath) {
  const raw = await readFile(jsonPath, 'utf8');
  return JSON.parse(stripBom(raw));
}

async function writeJson(jsonPath, value) {
  await writeFile(jsonPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function getActorLabel(state, actorKey) {
  return state.actors?.[actorKey]?.label || actorKey;
}

function getAckRecord(state, actorKey) {
  return state.lastAckBy?.[actorKey] || null;
}

function getSeenRecord(state, actorKey) {
  return state.lastSeenBy?.[actorKey] || null;
}

function isAckCurrent(state, actorKey) {
  const ack = getAckRecord(state, actorKey);
  return Boolean(ack && ack.revision === state.revision);
}

function isOwnerAckCurrent(state) {
  return isAckCurrent(state, state.nextOwnerKey);
}

function computeSlaBreach(state, now = new Date()) {
  const updatedAt = Date.parse(state.updatedAt || '');
  if (!Number.isFinite(updatedAt)) {
    return false;
  }

  const limitMs = Number(state.slaMinutes || 0) * 60 * 1000;
  if (!Number.isFinite(limitMs) || limitMs <= 0) {
    return false;
  }

  if (isOwnerAckCurrent(state)) {
    return false;
  }

  return now.getTime() - updatedAt > limitMs;
}

function summarizeLatestHandoff(handoffMarkdown) {
  const lines = String(handoffMarkdown || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const changeLine = [...lines].reverse().find((line) => line.startsWith('- Change:'));
  return changeLine ? changeLine.replace(/^- Change:\s*/, '') : null;
}

function buildHeartbeatSummary(state, actorKey, latestHandoff, now = new Date()) {
  const isNextOwner = state.nextOwnerKey === actorKey;
  const needsAck = Boolean(state.ackRequired) && isNextOwner && !isAckCurrent(state, actorKey);
  const slaBreached = computeSlaBreach(state, now);
  const shouldAlert = needsAck || slaBreached;
  return {
    project: state.project,
    actorKey,
    actorLabel: getActorLabel(state, actorKey),
    revision: state.revision,
    status: state.status,
    nextOwnerKey: state.nextOwnerKey,
    nextOwnerLabel: state.nextOwnerLabel || getActorLabel(state, state.nextOwnerKey),
    isNextOwner,
    ackRequired: Boolean(state.ackRequired),
    ackCurrent: isAckCurrent(state, actorKey),
    needsAck,
    slaMinutes: state.slaMinutes,
    slaBreached,
    shouldAlert,
    latestHandoff,
    lastSeen: getSeenRecord(state, actorKey),
    lastAck: getAckRecord(state, actorKey),
    summary: [
      `revision=${state.revision}`,
      `status=${state.status}`,
      `next=${state.nextOwnerLabel || getActorLabel(state, state.nextOwnerKey)}`,
      `needsAck=${needsAck ? 'yes' : 'no'}`,
      `slaBreached=${slaBreached ? 'yes' : 'no'}`,
      latestHandoff ? `latest=${latestHandoff}` : null
    ].filter(Boolean).join('; ')
  };
}

function usage() {
  console.error([
    'Usage:',
    '  node scripts/control_center_phase0_coordination_cli.mjs status [statePath] [handoffPath]',
    '  node scripts/control_center_phase0_coordination_cli.mjs heartbeat-check <actorKey> [statePath] [handoffPath]',
    '  node scripts/control_center_phase0_coordination_cli.mjs ack <actorKey> [statePath]'
  ].join('\n'));
}

async function commandStatus(statePath, handoffPath) {
  const state = await readJson(statePath);
  const latestHandoff = handoffPath ? summarizeLatestHandoff(await readFile(handoffPath, 'utf8')) : null;
  process.stdout.write(`${JSON.stringify(buildHeartbeatSummary(state, state.nextOwnerKey, latestHandoff), null, 2)}\n`);
}

async function commandHeartbeatCheck(actorKey, statePath, handoffPath) {
  const state = await readJson(statePath);
  const checkedAt = nowIso();
  state.lastSeenBy = state.lastSeenBy || {};
  state.lastSeenBy[actorKey] = {
    revision: state.revision,
    at: checkedAt
  };
  await writeJson(statePath, state);
  const latestHandoff = handoffPath ? summarizeLatestHandoff(await readFile(handoffPath, 'utf8')) : null;
  process.stdout.write(`${JSON.stringify(buildHeartbeatSummary(state, actorKey, latestHandoff), null, 2)}\n`);
}

async function commandAck(actorKey, statePath) {
  const state = await readJson(statePath);
  const ackAt = nowIso();
  state.lastSeenBy = state.lastSeenBy || {};
  state.lastAckBy = state.lastAckBy || {};
  state.lastSeenBy[actorKey] = {
    revision: state.revision,
    at: ackAt
  };
  state.lastAckBy[actorKey] = {
    revision: state.revision,
    at: ackAt
  };
  await writeJson(statePath, state);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    actorKey,
    actorLabel: getActorLabel(state, actorKey),
    revision: state.revision,
    ack: state.lastAckBy[actorKey]
  }, null, 2)}\n`);
}

async function main() {
  const [, , command, arg1, arg2, arg3] = process.argv;
  const repoRoot = process.cwd();
  const defaultState = path.join(repoRoot, 'notes', 'control-center-phase0-state.json');
  const defaultHandoff = path.join(repoRoot, 'notes', 'control-center-phase0-handoff.md');

  if (command === 'status') {
    await commandStatus(arg1 || defaultState, arg2 || defaultHandoff);
    return;
  }

  if (command === 'heartbeat-check') {
    if (!arg1) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandHeartbeatCheck(arg1, arg2 || defaultState, arg3 || defaultHandoff);
    return;
  }

  if (command === 'ack') {
    if (!arg1) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandAck(arg1, arg2 || defaultState);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
