# P3.2 Skills Recall source map v1

Scope: inventory candidate recall sources for the first bounded Skills Recall pass and map them to likely triggers and priority tiers.
Boundary: stay inside the retrieval layer. Do not reopen cron, delivery, gateway, startup-recovery schema redesign, or MCP implementation details.
References: `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`, `notes/startup-recovery-state.json`, `outputs/execution-checklist-v2.md`, `outputs/stage3-retrospective-v1.md`, `notes/control-center-phase0-handoff.md`, `notes/control-center-phase0-state.json`, `scripts/memory_bench.mjs`, `../AGENTS.md`, `../USER.md`, `../TOOLS.md`, `../memory/qxiaohu-collab-rules.json`, `../memory/qxiaohu-self-memory-protocol.md`, `../memory/qxiaohu-self-memory-state.json`, `../qxiaohu-profile.md`

---

## 1. Decision

Skills Recall should not try to read everything again after startup recovery.
It should recall a small ranked packet:

1. the recovered active-item source itself,
2. the smallest mandatory operating contract for the current context, and then
3. one domain-specific skill or repo-local runbook that matches the live trigger.

This keeps the next layer bounded and consistent with the P3.1 handoff: recover execution truth first, then recover the right instructions to continue.

---

## 2. Priority tiers

- `P0 mandatory`: read before acting when the trigger fires; skipping it is likely to cause a wrong handoff, wrong tool choice, or wrong boundary.
- `P1 strong candidate`: read when the trigger fires or when the recovered active item lives in the same subsystem; useful but not always blocking.
- `P2 background`: read only when `P0` and `P1` still leave a gap, or when explicitly tuning/debugging recall quality.

Stop once the active packet is sufficient. The first pass should usually land in 2-5 sources, not a repo-wide sweep.

---

## 3. Trigger order

Use this order when deciding what to recall next:

1. `active-item trigger`
   - Source: `notes/startup-recovery-state.json`
   - Signals: `path`, `expected_artifacts`, `command`, `notes`, and the live item summary.
   - Rule: the recovered item path is always the first candidate source.

2. `context contract trigger`
   - Signals: shared/subagent context, collaboration task, handoff/review/rework wording, relay wording, or explicit mention of memory/plans.
   - Rule: pull the smallest contract files that protect behavior for this context.

3. `domain/skill trigger`
   - Signals: user intent, named tool, product area, or an exact phrase that maps to an installed skill or repo-local runbook.
   - Rule: prefer one high-confidence domain match over several weak matches.

4. `adjacent subsystem trigger`
   - Signals: the active item is already inside `plans/`, `notes/`, `outputs/`, or a known project slice such as control-center phase 0.
   - Rule: read the nearest supporting file in that subsystem before widening further.

5. `background evidence trigger`
   - Signals: recall quality debugging, benchmark tuning, disagreement between chat wording and file evidence.
   - Rule: use benchmarks and retrospective evidence only after action-facing sources.

---

## 4. Source map

### 4.1 Core workspace contract

- `AGENTS.md`
  - Tier: `P0 mandatory`
  - Triggers: every session start; any task touching collaboration, handoff, `qxiaohu`, `erliang`, `memory`, or `plans`.
  - Why recall: startup order, memory rules, safety lines, shared-vs-external behavior.

- `SOUL.md`
  - Tier: `P1 strong candidate`
  - Triggers: every session start, tone-sensitive replies, or when behavior style needs grounding.
  - Why recall: keeps the assistant voice and operating stance consistent.

- `USER.md`
  - Tier: `P0 mandatory`
  - Triggers: every session start; relay-to-Erliang requests; naming, brevity, or collaboration-style decisions.
  - Why recall: user preferences directly affect reply shape and coordination style.

- `TOOLS.md`
  - Tier: `P1 strong candidate`
  - Triggers: task mentions local setup, devices, host-specific notes, SSH, cameras, or TTS.
  - Why recall: environment-specific notes belong here instead of in shared skills.

- `MEMORY.md`
  - Tier: `P0 mandatory` in main session only; `blocked` in shared/subagent contexts
  - Triggers: cross-day stable facts in a direct human session.
  - Why recall: long-term facts and verified user preferences.
  - Guardrail: do not auto-recall this file in shared or subagent contexts.

- `memory/YYYY-MM-DD.md` for today and yesterday
  - Tier: `P0 mandatory`
  - Triggers: every startup; status checks; "what changed recently" questions.
  - Why recall: newest decisions, active work, blockers, and carry-forward notes.
  - Current validated example: `memory/2026-03-17.md`.

- `memory/qxiaohu-self-memory-protocol.md`
  - Tier: `P0 mandatory` in main-session memory work; `P1 strong candidate` otherwise
  - Triggers: questions about what to read next, how to retrieve evidence, how to hand off, or how to resolve memory conflicts.
  - Why recall: fixed retrieval order and evidence-first rules.

- `memory/qxiaohu-self-memory-state.json`
  - Tier: `P1 strong candidate`
  - Triggers: startup status, active focus, open-loop recovery, recent-anchor lookup.
  - Why recall: compact working state and the latest focus queue.

- `memory/qxiaohu-collab-rules.json`
  - Tier: `P0 mandatory`
  - Triggers: any collaboration, relay, handoff, review, rework, or role-allocation task.
  - Why recall: structured defaults for roles, handoff package fields, rework rules, and invocation hints.

- `qxiaohu-profile.md`
  - Tier: `P1 strong candidate`
  - Triggers: should-Qxiaohu-own-this, local execution, troubleshooting, or builder-vs-reviewer routing.
  - Why recall: clarifies builder/operator strengths and boundaries.

### 4.2 Active-item and startup-recovery sources

- `qxiaohu-erliang-collab/notes/startup-recovery-state.json`
  - Tier: `P0 mandatory`
  - Triggers: startup recovery, doctor/resume/resolve flow, or any live-item recovery question.
  - Why recall: source of truth for the hottest active item and its supporting fields.

- `qxiaohu-erliang-collab/plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`
  - Tier: `P0 mandatory` for the first Skills Recall planning pass
  - Triggers: defining the next-layer scope, deciding what belongs in Skills Recall, or checking the boundary back to P3.1.
  - Why recall: explicit handoff into this layer and the out-of-scope list.

- `qxiaohu-erliang-collab/scripts/startup_recovery_check.mjs`
  - Tier: `P1 strong candidate`
  - Triggers: exact CLI semantics, `doctor`, `resume-hottest`, `resolve-hottest`, or state-field behavior.
  - Why recall: operational truth for the startup-recovery commands.

- `qxiaohu-erliang-collab/scripts/startup_recovery_check_test.mjs`
  - Tier: `P2 background`
  - Triggers: behavior dispute, regression check, or uncertainty about intended runtime behavior.
  - Why recall: tests anchor the expected state transitions.

- `qxiaohu-erliang-collab/notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md`
  - Tier: `P2 background`
  - Triggers: need a concrete create -> recover -> close example, or need proof that the live loop already passed.
  - Why recall: bounded E2E evidence for the current recovery flow.

Rule for this block:
- If the recovered item already points to a concrete `path`, read that path first.
- If `expected_artifacts` are present, rank them ahead of more distant docs in the same subsystem.
- Do not reopen alert delivery, watchdog plumbing, or gateway design from this recall step.

### 4.3 Collaboration runbooks inside `qxiaohu-erliang-collab`

- `qxiaohu-erliang-collab/outputs/execution-checklist-v2.md`
  - Tier: `P0 mandatory`
  - Triggers: handoff, review, verification method, known issues, next owner, or "what does a complete packet need".
  - Why recall: fixed five-field handoff package and role order.

- `qxiaohu-erliang-collab/outputs/stage3-retrospective-v1.md`
  - Tier: `P0 mandatory`
  - Triggers: rework, ETA, stalled execution, push/readability checks, or chat-status-vs-execution-status confusion.
  - Why recall: the actual failure modes that motivated startup recovery and handoff guardrails.

- `qxiaohu-erliang-collab/notes/control-center-phase0-handoff.md`
  - Tier: `P1 strong candidate`
  - Triggers: delta-only handoff updates, next-owner shifts, or shared-file-first coordination.
  - Why recall: concrete protocol for append-only asynchronous handoffs.

- `qxiaohu-erliang-collab/notes/control-center-phase0-state.json`
  - Tier: `P1 strong candidate`
  - Triggers: questions about revision, ACK state, SLA, owner, support owner, or deferred control-center scope.
  - Why recall: machine-readable coordination state for an active subsystem.

- `qxiaohu-erliang-collab/plans/control-center-phase0-readonly-integration.md`
  - Tier: `P1 strong candidate` when the active item is in control-center phase 0; `P2 background` otherwise
  - Triggers: `control-center`, `readonly`, `benchmark adapter`, `settings wiring`, or phase 0 implementation planning.
  - Why recall: subsystem-specific plan boundary.

- `qxiaohu-erliang-collab/profiles/*.md`
  - Tier: `P1 strong candidate`
  - Triggers: role assignment, `qxiaohu` vs `erliang`, `builder` vs `reviewer`, `qiu pan duan`, or `qiu zhi xing` routing.
  - Why recall: per-agent capabilities and preferred collaboration style.

### 4.4 Installed skill instructions

These are strong exact-match triggers. If the user intent clearly matches one of them, recall that `SKILL.md` before acting.

- `D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-doc/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: Feishu docs, cloud docs, or docx links.

- `D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-drive/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: Feishu cloud storage, files, folders, or drive requests.

- `D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-perm/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: sharing, permissions, collaborators, access changes.

- `D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-wiki/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: knowledge base, wiki, wiki links.

- `D:/openclaw/openclaw_app/node_modules/openclaw/skills/weather/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: weather, temperature, or forecast questions.

- `D:/openclaw/openclaw_app/node_modules/openclaw/skills/healthcheck/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: OpenClaw security audit, hardening, exposure review, SSH/firewall/update posture, version status.

- `D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: MCP servers, MCP tools, direct MCP calls, MCP config edits, or type generation.

- `D:/openclaw/openclaw_app/node_modules/openclaw/skills/oracle/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: oracle CLI usage, prompt/file bundling, sessions, engines, or file attachment patterns.

- `D:/openclaw/openclaw_app/node_modules/openclaw/skills/skill-creator/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: create a skill, improve a skill, audit a skill, edit `SKILL.md`, or restructure a skill directory.

- `D:/openclaw/openclaw_app/node_modules/openclaw/skills/clawhub/SKILL.md`
  - Tier: `P0 mandatory`
  - Triggers: search/install/update/publish skills from ClawHub.

### 4.5 Background evidence and tuning sources

- `qxiaohu-erliang-collab/scripts/memory_bench.mjs`
  - Tier: `P2 background`
  - Triggers: tuning startup ordering, debugging lookup misses, or justifying the baseline recall packet.
  - Why recall: already encodes a tested startup order and expected lookup hits.

- `qxiaohu-erliang-collab/benchmarks/20260316-074246-memory-debug-lookup/summary.json`
  - Tier: `P2 background`
  - Triggers: benchmark drift, missing-path investigations, or validation of recall ranking changes.
  - Why recall: quick benchmark signal without rereading the raw result log.

- `qxiaohu-erliang-collab/benchmarks/20260316-074246-memory-debug-lookup/report.md`
  - Tier: `P2 background`
  - Triggers: deeper recall-quality debugging after the summary is not enough.
  - Why recall: human-readable benchmark details.

Guardrails for this block:
- Benchmarks are evidence, not live operating instructions.
- Broad `plans/*.md` sweeps stay `P2` unless the active item or trigger names the exact plan.
- Dirty worktree files do not become recall sources just because they are modified.

---

## 5. Recommended first-pass retrieval packet

For the first bounded Skills Recall implementation or manual use, retrieve in this order:

1. `notes/startup-recovery-state.json` and the recovered item's own `path`
2. `AGENTS.md`, `USER.md`, and the latest relevant daily memory file(s)
3. `memory/qxiaohu-collab-rules.json`
4. exactly one of:
   - an installed `SKILL.md` with an exact domain trigger, or
   - a repo-local runbook/checklist in the same subsystem as the active item
5. `outputs/execution-checklist-v2.md` or `outputs/stage3-retrospective-v1.md` only when collaboration/rework triggers fire

This yields a small, explainable packet instead of a bag of loosely related memories.

---

## 6. Output shape for the next layer

The first Skills Recall result should be a ranked list of entries shaped like this:

- `source_path`
- `source_kind` (`workspace-contract`, `startup-state`, `repo-runbook`, `installed-skill`, `benchmark-evidence`)
- `priority_tier` (`P0`, `P1`, `P2`)
- `trigger_match`
- `why_now`
- `blocking` (`true` or `false`)

Minimum success condition:
- the recalled packet explains why each source is present, and
- no recalled source violates the context guardrail, especially `MEMORY.md` in shared/subagent contexts.

---

## 7. Exact validation checks

Run these checks from `C:/Users/555/.openclaw/workspace`.

```powershell
git -C qxiaohu-erliang-collab diff --check -- plans/p3-2-skills-recall-source-map-v1.md

$paths = @(
  'AGENTS.md',
  'SOUL.md',
  'USER.md',
  'TOOLS.md',
  'MEMORY.md',
  'memory/qxiaohu-collab-rules.json',
  'memory/qxiaohu-self-memory-protocol.md',
  'memory/qxiaohu-self-memory-state.json',
  'memory/2026-03-17.md',
  'qxiaohu-profile.md',
  'qxiaohu-erliang-collab/notes/startup-recovery-state.json',
  'qxiaohu-erliang-collab/plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md',
  'qxiaohu-erliang-collab/outputs/execution-checklist-v2.md',
  'qxiaohu-erliang-collab/outputs/stage3-retrospective-v1.md',
  'qxiaohu-erliang-collab/notes/control-center-phase0-handoff.md',
  'qxiaohu-erliang-collab/notes/control-center-phase0-state.json',
  'qxiaohu-erliang-collab/scripts/memory_bench.mjs',
  'qxiaohu-erliang-collab/benchmarks/20260316-074246-memory-debug-lookup/summary.json',
  'qxiaohu-erliang-collab/benchmarks/20260316-074246-memory-debug-lookup/report.md',
  'qxiaohu-erliang-collab/plans/p3-2-skills-recall-source-map-v1.md'
)
$missing = $paths | Where-Object { -not (Test-Path $_) }
if ($missing) { throw "Missing paths: $($missing -join ', ')" }
"workspacePathsOk=$($paths.Count)"

$skillPaths = @(
  'D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-doc/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-drive/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-perm/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/extensions/feishu/skills/feishu-wiki/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/skills/weather/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/skills/healthcheck/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/skills/oracle/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/skills/skill-creator/SKILL.md',
  'D:/openclaw/openclaw_app/node_modules/openclaw/skills/clawhub/SKILL.md'
)
$missingSkills = $skillPaths | Where-Object { -not (Test-Path $_) }
if ($missingSkills) { throw "Missing skill paths: $($missingSkills -join ', ')" }
"skillPathsOk=$($skillPaths.Count)"
```

Expected results:
- `git diff --check` returns clean output for this artifact.
- The workspace path check prints `workspacePathsOk=20`.
- The installed-skill path check prints `skillPathsOk=10`.

---

## 8. Out-of-scope reminders

This note does not decide:
- how to implement automatic recall execution,
- how to rank within embeddings or any vector store,
- cron/watchdog/delivery behavior,
- gateway changes,
- MCP integration wiring.

It only fixes the first bounded answer to: what should be recalled next, from where, and with what priority.

Author: Q小虎
Date: 2026-03-18
Version: v1
