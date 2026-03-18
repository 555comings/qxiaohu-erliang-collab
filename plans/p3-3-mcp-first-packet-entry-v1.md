# P3.3 MCP first packet / entry path v1

Date: 2026-03-18
Scope: define one bounded MCP entry layer that starts only after P3.2 Skills Recall has already surfaced the right MCP skill context.
Baseline: P3.1 startup recovery remains the owner of execution truth, P3.2 Skills Recall remains the owner of bounded source recall, and this note only defines the first safe MCP entry packet and command path without implementing the full MCP layer.
References: `plans/p3-2-skills-recall-v1.md`, `plans/p3-2-skills-recall-packet-review-gate-v1.md`, `notes/p3-2-skills-recall-operator-flow-v1.md`, `scripts/SKILLS_RECALL_PREVIEW.md`, `scripts/skills_recall_preview.mjs`, `notes/startup-recovery-state.json`, `D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md`

---

## 1. One-line goal

Once Skills Recall has already proven that MCP is the right domain, P3.3 should produce one inspect-first MCP entry packet that names the task anchor, the selected MCP surface, the exact first command to run, and the stop conditions before any real MCP tool call happens.

This is the bridge from "read the right MCP instructions" to "take the first bounded MCP step".

---

## 2. Entry condition from Skills Recall

Enter P3.3 only when all of these are true:

1. P3.1 already fixed the task anchor.
   - The active item is trustworthy, or a fresh bounded task has been named explicitly.
   - P3.3 must not choose a different hottest item than P3.1.

2. A P3.2 packet already exists or can be reproduced.
   - The packet is anchored to the same task.
   - The packet stays within the current P3.2 size and boundary rules.

3. The MCP trigger is explicit.
   - The P3.2 packet includes the `mcporter` skill path, or
   - the task text explicitly names `MCP`, `mcporter`, `server`, `tool`, or `tool config`.

4. The first MCP step can stay inspect-first.
   - The task is still at the "figure out the right MCP surface" stage.
   - If the very first meaningful step would require auth, config edits, daemon control, or a mutating tool call, stop and treat that as later-scope work.

5. The target selector is either known or explicitly missing.
   - Known means the task or packet already names a configured server.
   - Missing means P3.3 may still emit a bounded `needs-server-selector` packet, but it must not invent or guess the server.

If any of these fail, bounce back to P3.2 review or P3.1 state recovery instead of forcing MCP entry.

---

## 3. First MCP entry path

### 3.1 Step 1: start from the reviewed Skills Recall packet

Use the P3.2 packet as the only allowed MCP entry anchor.

Required carry-forward facts:
- the `active_item` from P3.2,
- the `mcporter` skill hit or the explicit MCP wording that justified it,
- any task path or artifact hint tied to the current work,
- the current boundary that P3.1 still owns execution truth.

Reason:
- P3.3 should enter MCP because the task and recall packet say so, not because the operator feels curious.

### 3.2 Step 2: resolve the v1 entry mode

The first bounded MCP pass supports exactly one entry mode:
- `configured-server-inspect`

Definition:
- the task already points to a configured MCP server name, or
- the operator can use `mcporter list --json` to confirm what configured servers exist before selecting one.

Why this mode comes first:
- it is the lowest-risk MCP entry path already supported by `mcporter`,
- it lets the operator inspect available surfaces before any `call`, and
- it avoids bundling auth, ad-hoc stdio commands, raw URLs, or config mutation into the first pass.

Explicitly not part of the first mode:
- `mcporter auth ...`
- `mcporter config add|remove|import ...`
- `mcporter daemon ...`
- `mcporter call ...`
- `mcporter generate-cli ...`
- `mcporter emit-ts ...`
- ad-hoc HTTP or stdio server definitions

### 3.3 Step 3: emit one MCP entry packet

The first output of P3.3 is not a live tool call yet.
It is one packet that says what the first safe MCP inspection command should be.

Decision rule:
- if a configured server is already known, the packet should point directly to `mcporter list <server> --schema --json`;
- if no server is known yet, the packet should point to `mcporter list --json` and stop there until one server is selected;
- if the task would require more than inspection, the packet must stop and name the missing prerequisite instead of drifting into implementation.

### 3.4 Step 4: inspect before call

The first actual command path is always inspection-first.

Command order:
1. inventory configured servers
   - `mcporter list --json`
2. inspect the selected configured server
   - `mcporter list <server> --schema --json`
3. stop after schema inspection
   - selecting or running a concrete MCP tool belongs to a later packet, not to this first entry note

Expected operator outcome after step 2:
- confirm whether the named server exists,
- inspect the available tool surface in machine-readable form,
- decide whether a later P3.3.x packet is justified for a concrete `mcporter call`.

### 3.5 No-ready-entry outcome

A no-ready-entry packet is valid when:
- the P3.2 packet is anchored but no configured server is named,
- `mcporter list --json` returns zero configured servers,
- the task actually depends on auth, config import, ad-hoc stdio, or a remote URL,
- the task already implies a mutating tool call before inspection.

In that case, P3.3 should stop with a packet that says:
- why MCP entry is not ready,
- what selector or prerequisite is missing,
- which later layer should own the next decision.

---

## 4. Minimum MCP entry packet shape

P3.3 should return a small packet, not a workflow essay.

Required top-level fields:
- `entry_trigger`
- `active_item`
- `skills_packet_source`
- `mcp_target`
- `preflight_command`
- `expected_preflight_signal`
- `stop_conditions`
- `boundary`

Required `active_item` fields:
- `id`
- `title`
- `owner`
- `artifact_hint`

Required `skills_packet_source` fields:
- `packet_path`
- `mcporter_source_path`
- `why_mcp_now`

Required `mcp_target` fields:
- `mode` (`configured-server-inspect`)
- `server_name` (string or `null`)
- `tool_name` (string or `null`)
- `selector_confidence` (`named | inferred-from-config-list | missing`)

Required `preflight_command` fields:
- `command`
- `cwd`
- `expected_exit_code`

Required `expected_preflight_signal` fields:
- `kind` (`configured-server-list | server-schema`)
- `must_be_json`
- `minimum_success_rule`

Required `stop_conditions` entries should cover at least:
- missing configured server name after `mcporter list --json`,
- no configured servers available,
- task requires auth/config mutation/ad-hoc server setup,
- task requires a mutating `mcporter call` before inspection,
- P3.1 or P3.2 anchor drift is detected.

Required `boundary` fields:
- `does_not_mutate_mcporter_config`
- `does_not_start_auth_flow`
- `does_not_call_mutating_tool`
- `does_not_override_p3_layers`

### 4.1 Example minimal packet

```json
{
  "entry_trigger": "skills-recall-mcp-hit",
  "active_item": {
    "id": "p3-3-mcp-first-packet-entry-v1",
    "title": "Define the first MCP entry packet",
    "owner": "qxiaohu",
    "artifact_hint": "plans/p3-3-mcp-first-packet-entry-v1.md"
  },
  "skills_packet_source": {
    "packet_path": "plans/p3-2-skills-recall-v1.md",
    "mcporter_source_path": "D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md",
    "why_mcp_now": "The live task explicitly opens the MCP layer after Skills Recall and needs the first safe mcporter entry step."
  },
  "mcp_target": {
    "mode": "configured-server-inspect",
    "server_name": null,
    "tool_name": null,
    "selector_confidence": "missing"
  },
  "preflight_command": {
    "command": "mcporter list --json",
    "cwd": "qxiaohu-erliang-collab",
    "expected_exit_code": 0
  },
  "expected_preflight_signal": {
    "kind": "configured-server-list",
    "must_be_json": true,
    "minimum_success_rule": "output.mode=list and output.servers is an array"
  },
  "stop_conditions": [
    "no configured server selected after the inventory step",
    "mcporter reports zero configured servers",
    "the task requires auth, config mutation, or ad-hoc server setup",
    "the next requested action is a mutating tool call rather than inspection",
    "P3.1 or P3.2 anchor drift is detected"
  ],
  "boundary": {
    "does_not_mutate_mcporter_config": true,
    "does_not_start_auth_flow": true,
    "does_not_call_mutating_tool": true,
    "does_not_override_p3_layers": true
  }
}
```

### 4.2 Ready-for-schema-inspection variant

If the configured server is already known, the packet should switch only these parts:
- `mcp_target.server_name` becomes the known server name,
- `mcp_target.selector_confidence` becomes `named`,
- `preflight_command.command` becomes `mcporter list <server> --schema --json`,
- `expected_preflight_signal.kind` becomes `server-schema`.

Nothing else should widen.

---

## 5. Boundary and out-of-scope line

### 5.1 P3.3 owns

This first MCP note only owns:
- translating a reviewed P3.2 MCP hit into one inspect-first MCP packet,
- naming the first safe `mcporter` command,
- stating the stop conditions before any real tool call,
- keeping the transition from recall to MCP inspectable.

### 5.2 P3.3 must not do

This first MCP note must not:
- edit `notes/startup-recovery-state.json`,
- reinterpret the P3.2 packet or choose a different task anchor,
- mutate mcporter config,
- start OAuth or browser auth,
- manage the mcporter daemon,
- generate CLIs or TypeScript,
- call a mutating MCP tool,
- define gateway, cron, delivery, or unrelated cleanup work,
- implement the full MCP execution layer.

### 5.3 Escalation boundary

If the task needs anything beyond inspection-first entry, stop and hand off to a later bounded packet such as:
- selector resolution for one known server,
- safe read-only tool-call planning for one tool,
- config/auth remediation,
- ad-hoc server onboarding.

Do not hide those under this first entry note.

---

## 6. Done-enough line for this pass

This note counts as done enough when all of the following are true:
- the entry condition from P3.2 is explicit,
- the first MCP mode is bounded to configured-server inspection,
- the minimum packet shape is fixed,
- the stop conditions are explicit,
- the boundary against config/auth/call implementation work is explicit,
- the validation checks prove the note is structurally complete and the inspect-first path is testable now.

Anything beyond that belongs to the next bounded MCP packet, not this one.

---

## 7. Exact validation checks

Run from `C:/Users/555/.openclaw/workspace/qxiaohu-erliang-collab`.

```powershell
git diff --check -- plans/p3-3-mcp-first-packet-entry-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('plans/p3-3-mcp-first-packet-entry-v1.md','utf8'); const required=['## 2. Entry condition from Skills Recall','## 3. First MCP entry path','## 4. Minimum MCP entry packet shape','## 5. Boundary and out-of-scope line','## 7. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const boundary=['does_not_mutate_mcporter_config','does_not_start_auth_flow','does_not_call_mutating_tool','does_not_override_p3_layers','mcporter list --json','mcporter list <server> --schema --json']; for (const token of boundary) { if (!text.includes(token)) throw new Error('missing boundary '+token); } console.log('mcp-plan-structure-ok');"
node -e "const fs=require('fs'); const paths=['plans/p3-2-skills-recall-v1.md','plans/p3-2-skills-recall-packet-review-gate-v1.md','notes/p3-2-skills-recall-operator-flow-v1.md','scripts/SKILLS_RECALL_PREVIEW.md','scripts/skills_recall_preview.mjs','plans/p3-3-mcp-first-packet-entry-v1.md','D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md']; const missing=paths.filter(p=>!fs.existsSync(p)); if (missing.length) throw new Error('missing paths: '+missing.join(', ')); console.log('mcp-paths-ok='+paths.length);"
mcporter list --json
node -e "const fs=require('fs'); const {spawnSync}=require('child_process'); const args=['scripts/skills_recall_preview.mjs','preview','--owner','qxiaohu','--task-title','Define the first MCP entry packet','--task-path','plans/p3-3-mcp-first-packet-entry-v1.md','--user-request','Open the MCP layer after Skills Recall, define the first packet and the safe entry path without implementing the full MCP layer.','--validate']; const run=spawnSync('node',args,{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); fs.writeFileSync(process.env.TEMP + '/p3-3-mcp-skills-packet.json', run.stdout, 'utf8'); if (!/skills-recall-packet-ok/.test(run.stderr)) throw new Error('missing validation marker'); console.log('skills-preview-write-ok');"
node -e "const fs=require('fs'); const packet=JSON.parse(fs.readFileSync(process.env.TEMP + '/p3-3-mcp-skills-packet.json','utf8')); const hit=(packet.recall_candidates||[]).find(item=>String(item.source_path||'').replace(/\\/g,'/').endsWith('/skills/mcporter/SKILL.md')); if (!hit) throw new Error('expected mcporter skill hit'); if (!packet.boundary || packet.boundary.does_not_update_promise_state !== true || packet.boundary.does_not_override_hottest_item !== true || packet.boundary.does_not_start_external_actions !== true) throw new Error('unexpected P3.2 boundary flags'); console.log('skills-to-mcp-entry-ok');"
```

Expected results:
- `git diff --check` returns clean output for this plan.
- the structure check prints `mcp-plan-structure-ok`.
- the path check prints `mcp-paths-ok=7`.
- `mcporter list --json` returns JSON with `"mode": "list"` and a `servers` array.
- the preview/validate plus packet inspection check prints `skills-to-mcp-entry-ok`.

---

## 8. Work log

- `2026-03-18 01:21 +08`: checked the dirty repo state inside `qxiaohu-erliang-collab` and confirmed this pass should stay on one new plan file only.
- `2026-03-18 01:22 +08`: read the P3.1 to P3.2 transition artifacts, the Skills Recall operator flow, the preview-helper note, and the `mcporter` skill so the MCP plan stays attached to the existing handoff path.
- `2026-03-18 01:25 +08`: wrote `plans/p3-3-mcp-first-packet-entry-v1.md` as the first bounded MCP planning artifact after Skills Recall.
- `2026-03-18 01:25 +08`: prepared exact validation checks that verify structure, referenced paths, `mcporter` CLI availability, and the P3.2 to P3.3 handoff signal.
- `2026-03-18 01:26 +08`: ran the exact checks, caught the PowerShell redirection issue in the packet handoff step, replaced it with a UTF-8-safe Node write, and re-ran the checks to a clean pass.

## 9. Exact file paths changed

- `plans/p3-3-mcp-first-packet-entry-v1.md`

Author: Q xiaohu
Version: v1
