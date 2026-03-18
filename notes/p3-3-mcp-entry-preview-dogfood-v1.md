# P3.3 MCP entry preview dogfood v1

Date: 2026-03-19
Scope: one bounded dogfood note that proves the inspect-first MCP entry helper works on both the current live zero-server path and one deterministic saved-schema path.
Boundary: this note does not mutate mcporter config, start auth, manage the daemon, call a tool, or reopen P3.1/P3.2 scope. It only records one reproducible operator pass with exact commands.
References: `plans/p3-3-mcp-first-packet-entry-v1.md`, `notes/p3-3-mcp-inspect-first-helper-v1.md`, `scripts/mcp_entry_preview.mjs`, `scripts/mcp_entry_preview_test.mjs`, `plans/p3-2-skills-recall-v1.md`, `D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md`

---

## 1. Dogfood targets

This pass exercises both bounded P3.3 outcomes.

Live task anchor:
- `Define the first MCP entry packet`
- path: `plans/p3-3-mcp-first-packet-entry-v1.md`

Worked outcomes:
1. live inventory on the current machine
   - proves the helper handles `mcporter list --json` with zero configured servers
2. deterministic named-server schema preview
   - proves the helper emits the inspect-first schema packet without needing a real configured server

Why this is a good dogfood pass:
- it covers the real current-machine baseline instead of assuming a configured MCP setup exists;
- it also covers the schema-inspection branch without widening into auth, config edits, or tool calls;
- both branches stay inside the exact P3.3 boundary already defined by the plan.

---

## 2. Exact dogfood flow

Run from `qxiaohu-erliang-collab/`.

### 2.1 Run the helper test file first

```powershell
node --test scripts/mcp_entry_preview_test.mjs
```

Expected result:
- five passing tests
- zero failures

### 2.2 Run the live inventory path on this machine

```powershell
node scripts/mcp_entry_preview.mjs preview --task-title "Define the first MCP entry packet" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --validate
```

Expected result on this machine today:
- stderr prints `mcp-entry-packet-ok`
- packet `mcp_target.server_name = null`
- packet `outcome.status = "needs-server-selector"`
- packet `outcome.reason = "no-configured-servers"`
- packet `preflight_command.command = "mcporter list --json"`

### 2.3 Run the deterministic named-server schema path

```powershell
$schema = Join-Path $env:TEMP 'mcp-entry-preview-demo-schema.json'
node -e "const fs=require('fs'); const p=process.argv[1]; fs.writeFileSync(p, JSON.stringify({tools:[{name:'search'},{name:'read'}],resources:[]}, null, 2)+'\n', 'utf8');" $schema
node scripts/mcp_entry_preview.mjs preview --task-title "Inspect the demo server schema" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --server demo --schema-json-path $schema --validate
```

Expected result:
- stderr prints `mcp-entry-packet-ok`
- packet `mcp_target.server_name = "demo"`
- packet `observed_signal.kind = "server-schema"`
- packet `observed_signal.tool_count = 2`
- packet `outcome.status = "schema-inspected"`
- packet `preflight_command.command = "mcporter list demo --schema --json"`

---

## 3. Produced live inventory packet

This is the live no-configured-server packet produced on the current machine.

```json
{
  "entry_trigger": "skills-recall-mcp-hit",
  "active_item": {
    "id": "p3-3-mcp-first-packet-entry-v1",
    "title": "Define the first MCP entry packet",
    "owner": "qxiaohu",
    "artifact_hint": "plans/p3-3-mcp-first-packet-entry-v1.md"
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
  "observed_signal": {
    "kind": "configured-server-list",
    "signal_source": "command:mcporter list --json",
    "mode": "list",
    "server_count": 0,
    "server_names": [],
    "counts": {
      "ok": 0,
      "auth": 0,
      "offline": 0,
      "http": 0,
      "error": 0
    }
  },
  "outcome": {
    "status": "needs-server-selector",
    "reason": "no-configured-servers",
    "next_step": "Stop here and treat missing configured servers as a prerequisite rather than forcing auth, config edits, or an ad-hoc server."
  }
}
```

Interpretation:
- the helper does not fail when no MCP servers exist;
- it emits the expected inspect-first stop packet instead of guessing a server or widening scope.

---

## 4. Produced named-server schema packet

This is the deterministic saved-schema packet for the named-server path.

```json
{
  "entry_trigger": "skills-recall-mcp-hit",
  "active_item": {
    "id": "p3-3-mcp-first-packet-entry-v1",
    "title": "Inspect the demo server schema",
    "owner": "qxiaohu",
    "artifact_hint": "plans/p3-3-mcp-first-packet-entry-v1.md"
  },
  "mcp_target": {
    "mode": "configured-server-inspect",
    "server_name": "demo",
    "tool_name": null,
    "selector_confidence": "named"
  },
  "preflight_command": {
    "command": "mcporter list demo --schema --json",
    "cwd": "qxiaohu-erliang-collab",
    "expected_exit_code": 0
  },
  "observed_signal": {
    "signal_source": "file:C:/Users/555/AppData/Local/Temp/mcp-entry-preview-demo-schema.json",
    "kind": "server-schema",
    "server_name": "demo",
    "top_level_keys": [
      "resources",
      "tools"
    ],
    "tool_count": 2
  },
  "outcome": {
    "status": "schema-inspected",
    "reason": "configured-server-schema-captured",
    "next_step": "Stop after schema inspection and hand off a later bounded packet before any mcporter call."
  }
}
```

Interpretation:
- the helper emits the correct inspect-first packet when a server name is already known;
- it still stops before any `mcporter call`, auth flow, or config mutation.

---

## 5. Dogfood verdict

Decision:
- `pass`

Why it passes:
1. the live machine baseline is handled correctly
   - zero configured servers becomes a first-class packet outcome, not a helper crash
2. the inspect-first boundary holds
   - both packets stop before auth, config mutation, daemon management, or tool calls
3. the two packet shapes stay consistent
   - inventory uses `mcporter list --json`; named schema uses `mcporter list <server> --schema --json`
4. the no-ready-entry path is explicit
   - the live machine today cleanly reports `needs-server-selector`
5. the deterministic branch is reproducible
   - the saved schema fixture proves the named-server branch without depending on a real MCP environment

One bounded carry-forward note:
- the next real P3.3 step now depends on an actual configured server name or an explicit decision that zero configured servers is the stopping point for this machine.

---

## 6. Recorded command results

Recorded on this pass:
- `node --test scripts/mcp_entry_preview_test.mjs` passed with `5/5` green checks
- `node scripts/mcp_entry_preview.mjs preview --task-title "Define the first MCP entry packet" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --validate` printed `mcp-entry-packet-ok` and returned `outcome.reason = "no-configured-servers"`
- the saved-schema command for `demo` printed `mcp-entry-packet-ok` and returned `observed_signal.tool_count = 2` with `outcome.status = "schema-inspected"`

Interpretation:
- the helper is real, reproducible, and already covers both the current-machine stop path and the named-server schema path.

---

## 7. Exact validation checks for this note

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-3-mcp-entry-preview-dogfood-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/p3-3-mcp-entry-preview-dogfood-v1.md','utf8'); const required=['## 2. Exact dogfood flow','## 3. Produced live inventory packet','## 4. Produced named-server schema packet','## 5. Dogfood verdict','## 7. Exact validation checks for this note']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const mustInclude=['node --test scripts/mcp_entry_preview_test.mjs','mcp-entry-packet-ok','no-configured-servers','mcporter list --json','mcporter list demo --schema --json']; for (const token of mustInclude) { if (!text.includes(token)) throw new Error('missing token '+token); } console.log('p3-3-dogfood-note-structure-ok');"
```

Expected results:
- `git diff --check` returns clean output for this note
- the Node check prints `p3-3-dogfood-note-structure-ok`

---

## 8. Work log

- `2026-03-19 00:47 +08`: re-read the P3.3 plan, helper note, helper runtime, and helper tests to keep this pass inside the existing inspect-first boundary.
- `2026-03-19 00:47 +08`: ran `node --test scripts/mcp_entry_preview_test.mjs` and confirmed the helper test suite still passes cleanly.
- `2026-03-19 00:48 +08`: ran the live inventory preview and confirmed the current machine still reports zero configured MCP servers via a valid stop packet.
- `2026-03-19 00:49 +08`: ran the deterministic named-server schema preview using a saved JSON fixture and confirmed the helper emits the expected `schema-inspected` packet.
- `2026-03-19 00:49 +08`: wrote this dogfood note so the P3.3 helper now has a reproducible worked example for both bounded outcomes.

## 9. Exact files changed

- `notes/p3-3-mcp-entry-preview-dogfood-v1.md`

Author: Q xiaohu
Version: v1
