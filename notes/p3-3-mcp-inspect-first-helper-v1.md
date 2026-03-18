# P3.3 MCP inspect-first helper v1

Date: 2026-03-18
Scope: turn the P3.3 plan into one bounded runnable helper that emits the inspect-first MCP entry packet from either `mcporter list --json` or `mcporter list <server> --schema --json`.
Baseline: this helper does not mutate mcporter config, start auth, manage the daemon, or call a tool. It only makes the first inspection packet real and testable.
Companion plan: `plans/p3-3-mcp-first-packet-entry-v1.md`

---

## 1. What this artifact adds

This pass adds one script:
- `scripts/mcp_entry_preview.mjs`

What it does:
- runs the lowest-risk inventory step with `mcporter list --json`, or
- reuses a saved inventory JSON file for deterministic tests, or
- inspects one named configured server with `mcporter list <server> --schema --json`, or
- reuses a saved schema JSON file for deterministic tests.

What it emits:
- one MCP entry packet anchored to the current task,
- the exact preflight command,
- the observed signal summary,
- the first-class no-configured-server outcome, and
- the stop line before any later `mcporter call` work.

---

## 2. Why this stays bounded

This helper deliberately stops before later-scope MCP work.
It does not:
- add or remove server config,
- start OAuth or browser auth,
- guess a server when none is selected,
- auto-pick a tool from a schema,
- call `mcporter call ...`, or
- widen into full MCP integration.

The zero-server result is treated as a normal packet outcome, not as a helper failure.
That keeps the inspect-first path usable even on machines where no MCP server is configured yet.

---

## 3. Commands

Run from `C:/Users/555/.openclaw/workspace/qxiaohu-erliang-collab`.

### 3.1 Live inventory path

This uses the real local `mcporter` binary and is the exact current-machine check for the no-configured-server path:

```powershell
node scripts/mcp_entry_preview.mjs preview --task-title "Define the first MCP entry packet" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --validate
```

Current live outcome on this machine:
- `mcporter list --json` returns `{"mode":"list","servers":[]}` with zero configured servers.
- The helper emits `outcome.status = "needs-server-selector"` and `outcome.reason = "no-configured-servers"`.

### 3.2 Saved inventory path for deterministic tests

```powershell
node scripts/mcp_entry_preview.mjs preview --task-title "Define the first MCP entry packet" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --list-json-path C:/temp/mcporter-list.json --validate
```

### 3.3 Saved schema path for deterministic tests

```powershell
node scripts/mcp_entry_preview.mjs preview --task-title "Inspect the demo server schema" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --server demo --schema-json-path C:/temp/demo-schema.json --validate
```

If a configured server exists later, the same helper can use the real inspect step directly:

```powershell
node scripts/mcp_entry_preview.mjs preview --task-title "Inspect the selected MCP server schema" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --server <server> --validate
```

---

## 4. Exact validation checks

```powershell
node --test scripts/mcp_entry_preview_test.mjs
node scripts/mcp_entry_preview.mjs preview --task-title "Define the first MCP entry packet" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --validate
node -e "const fs=require('fs'); const path=require('path'); const p=path.join(process.env.TEMP,'demo-schema.json'); fs.writeFileSync(p, JSON.stringify({tools:[{name:'search'},{name:'read'}], resources:[]}, null, 2) + '\n', 'utf8'); console.log(p);"
node scripts/mcp_entry_preview.mjs preview --task-title "Inspect the demo server schema" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --server demo --schema-json-path $env:TEMP/demo-schema.json --validate
```

Expected results:
- the test file passes with five green checks,
- the live inventory command prints `mcp-entry-packet-ok` to stderr,
- the live inventory packet reports `outcome.reason = "no-configured-servers"` on this machine today,
- the saved-schema example prints `mcp-entry-packet-ok` and reports `outcome.status = "schema-inspected"`.

---

## 5. Work log

- `2026-03-18 01:45 +08`: inspected the existing P3.3 plan and the real local `mcporter list --json` output so the helper could match the actual zero-server path instead of guessing it.
- `2026-03-18 01:49 +08`: wrote `scripts/mcp_entry_preview.mjs` to emit one inspect-first MCP entry packet from either live mcporter output or saved JSON fixtures.
- `2026-03-18 01:52 +08`: wrote `scripts/mcp_entry_preview_test.mjs` to cover zero-server inventory, configured-server inventory, and named-server schema inspection without requiring full MCP integration.
- `2026-03-18 01:54 +08`: wrote this note with exact commands, current-machine behavior, and the validation checklist.
- `2026-03-18 01:57 +08`: fixed Windows command launching inside `scripts/mcp_entry_preview.mjs` so the live helper resolves the local `mcporter` install the same way PowerShell does, then re-ran the live inventory and saved-schema checks.

## 6. Exact file paths changed

- `scripts/mcp_entry_preview.mjs`
- `scripts/mcp_entry_preview_test.mjs`
- `notes/p3-3-mcp-inspect-first-helper-v1.md`
