# Skills Recall preview helper

This helper emits a first-pass P3.2 Skills Recall packet from either:
- the hottest open startup-recovery item for one owner, or
- an explicit task path/title when there is no open startup item yet.

It does not mutate `notes/startup-recovery-state.json` and it does not start any external action.

The default packet stays schema-clean so it can be checked directly against the current P3.2 packet schema and review gate.

## Commands

Run from `qxiaohu-erliang-collab/`.

Emit and validate one packet in a single step:

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Implement the first skills recall helper" --task-path plans/p3-2-skills-recall-v1.md --user-request "Create a small CLI helper, validate it, and include a work log with exact files changed." --validate
```

Emit, validate, and save a UTF-8 packet file for the review step:

```powershell
$packet = Join-Path $env:TEMP 'skills-recall-packet.json'
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Implement the first skills recall helper" --task-path plans/p3-2-skills-recall-v1.md --user-request "Create a small CLI helper, validate it, and include a work log with exact files changed." --validate --write-packet $packet
```

Use the current startup-recovery state instead of inline task context:

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --user-request "Get the current weather forecast before the handoff." --validate
```

Or point to a specific state snapshot:

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --state-path C:/temp/startup-state.json --user-request "Enter rework, sync an ETA, and make sure the artifact is readable before review." --validate
```

Validate a saved packet file:

```powershell
node scripts/skills_recall_preview.mjs validate --owner qxiaohu --packet-path C:/temp/skills-recall-packet.json
```

Review a saved packet file with the bundled gate checks:

```powershell
node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path C:/temp/skills-recall-packet.json
```

Validate packet JSON from stdin:

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Implement the first skills recall helper" --task-path plans/p3-2-skills-recall-v1.md --user-request "Create a small CLI helper, validate it, and include a work log with exact files changed." | node scripts/skills_recall_preview.mjs validate --owner qxiaohu
```

Review packet JSON from stdin:

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Implement the first skills recall helper" --task-path plans/p3-2-skills-recall-v1.md --user-request "Create a small CLI helper, validate it, and include a work log with exact files changed." | node scripts/skills_recall_preview.mjs review --owner qxiaohu
```

## Output shape

The `preview` command prints one JSON packet with:
- `trigger`
- `active_item`
- `recall_candidates`
- `boundary`

Optional fields may also appear where the schema allows them:
- `active_item.notes`
- `active_item.expected_artifacts`
- `active_item.evidence_paths`
- `active_item.evidence_commands`
- `recall_candidates[*].priority_index`

Each recall candidate always includes:
- `source_path`
- `source_kind`
- `why_recalled`
- `required_before_action`
- `matched_from`

The `validate` command prints a JSON report with:
- `ok`
- `schema_id`
- `schema_path`
- `state_path`
- `packet_summary`
- `checks`
- `errors`

The `review` command prints a JSON report with:
- `ok`
- `verdict`
- `schema_id`
- `schema_path`
- `state_path`
- `packet_summary`
- `review_summary`
- `checks`
- `errors`

## Current selection rules

The first bounded pass stays capped at three recalled sources:
1. one active-item anchor,
2. one workspace note or repo-local runbook, and
3. one installed skill when the task text clearly maps to one.

Current local runbook selection favors:
- `outputs/execution-checklist-v2.md` for handoff/validation wording,
- `outputs/stage3-retrospective-v1.md` for rework/ETA/readability wording,
- `memory/qxiaohu-collab-rules.json` for shared collaboration context,
- `TOOLS.md` for host-specific setup hints.

Installed skills currently map exact hints for:
- Feishu docs, drive, permissions, wiki
- weather
- healthcheck
- mcporter
- oracle
- skill-creator
- clawhub

## Validation guardrails

The validator checks the live packet against the current schema and review expectations by enforcing:
- required and allowed packet keys from `plans/p3-2-skills-recall-packet-schema-v1.json`
- `recall_candidates.length <= 3`
- at most one `installed-skill`
- real `source_path` files and blocked-source rejection for `MEMORY.md`
- hottest-open-item alignment when a startup state snapshot exists
- boundary flags staying locked to `true`
- scope-smuggle phrases such as `read all plans`, `cron`, `gateway`, and `delivery plumbing`

The review command reuses that validation pass and adds a small operator-focused verdict layer by checking:
- whether the packet already makes the first read obvious,
- whether at least one recalled source is marked `required_before_action=true` when recall exists, and
- whether any `priority_index` values still match the packet order instead of drifting.

## Verification

```powershell
node --test scripts/skills_recall_preview_test.mjs
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Implement the first skills recall helper" --task-path plans/p3-2-skills-recall-v1.md --user-request "Create a small CLI helper, validate it, and include a work log with exact files changed." --validate
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Implement the first skills recall helper" --task-path plans/p3-2-skills-recall-v1.md --user-request "Create a small CLI helper, validate it, and include a work log with exact files changed." --write-packet $env:TEMP/skills-recall-packet.json
node scripts/skills_recall_preview.mjs validate --owner qxiaohu --packet-path $env:TEMP/skills-recall-packet.json
node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path $env:TEMP/skills-recall-packet.json
```
