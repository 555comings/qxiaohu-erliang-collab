# P3.3 MCP zero-server boundary v1

Date: 2026-03-19
Scope: freeze the current-machine P3.3 boundary when `mcporter list --json` returns zero configured servers, so the MCP layer is not mistaken for unfinished implementation work.
Boundary: this note does not add MCP config, start auth, manage the daemon, call any MCP tool, or widen into full MCP execution work. It only records the stop line for the current machine.
References: `plans/p3-3-mcp-first-packet-entry-v1.md`, `notes/p3-3-mcp-inspect-first-helper-v1.md`, `notes/p3-3-mcp-entry-preview-dogfood-v1.md`, `scripts/mcp_entry_preview.mjs`, `scripts/mcp_entry_preview_test.mjs`, `plans/p3-2-skills-recall-v1.md`, `D:/openclaw/openclaw_app/node_modules/openclaw/skills/mcporter/SKILL.md`

---

## 1. Decision

Decision:
- freeze the current machine at the P3.3 `needs-server-selector` boundary.

Meaning:
- P3.3 is not blocked by a missing helper or broken packet shape;
- the current stopping reason is environmental: this machine has zero configured MCP servers right now;
- until a real configured server exists, the correct behavior is to stop after `mcporter list --json` and treat selector/config as a later decision.

This is the stable current-machine interpretation of the inspect-first MCP layer.

---

## 2. Why this freeze is correct

1. The inspect-first helper already exists and passes tests.
- `scripts/mcp_entry_preview.mjs`
- `scripts/mcp_entry_preview_test.mjs`

2. The helper already covers both bounded packet outcomes.
- live inventory with zero configured servers
- deterministic named-server schema inspection

3. The current machine baseline is explicit.
- `mcporter list --json` returns `mode=list` and `servers=[]`
- the emitted packet returns `outcome.status = "needs-server-selector"`
- the emitted packet returns `outcome.reason = "no-configured-servers"`

4. Forcing the next step now would widen scope.
- adding config, auth, ad-hoc servers, daemon work, or a real tool call all belong to later bounded packets, not to the current P3.3 stop line.

So the honest read is: the layer works; the environment is not yet ready for the next inspect step.

---

## 3. Current-machine packet baseline

The current machine emits this bounded result:

```json
{
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
    "mode": "list",
    "server_count": 0,
    "server_names": []
  },
  "outcome": {
    "status": "needs-server-selector",
    "reason": "no-configured-servers"
  }
}
```

Interpretation:
- there is no server to inspect yet;
- the first safe MCP command is still `mcporter list --json`;
- the correct next move is a later selector/config decision, not a fake continuation.

---

## 4. What stays out of scope

Do not treat this note as approval to do any of the following automatically:
- `mcporter auth ...`
- `mcporter config add|remove|import ...`
- `mcporter daemon ...`
- `mcporter call ...`
- ad-hoc HTTP or stdio server setup
- gateway or delivery work
- unrelated memory cleanup

If one of those becomes necessary, open a new bounded packet for that exact step.

---

## 5. Next-owner rule

Current next owner:
- Q小虎 keeps the MCP layer frozen at the current stop line.

Next transition condition:
- only move beyond this note when one of these becomes true:
  1. a real configured MCP server name exists on this machine, or
  2. 猫爸 explicitly wants a bounded config/onboarding pass for one server.

Return mode when that happens:
- emit one new inspect-first packet for the named server and stop again after schema inspection.

Until then, treat the zero-server packet as the final truthful P3.3 status for this machine.

---

## 6. Exact validation checks

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-3-mcp-zero-server-boundary-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/p3-3-mcp-zero-server-boundary-v1.md','utf8'); const required=['## 1. Decision','## 2. Why this freeze is correct','## 3. Current-machine packet baseline','## 4. What stays out of scope','## 6. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const mustInclude=['needs-server-selector','no-configured-servers','mcporter list --json','mcporter config add|remove|import ...','scripts/mcp_entry_preview.mjs']; for (const token of mustInclude) { if (!text.includes(token)) throw new Error('missing token '+token); } console.log('p3-3-zero-server-boundary-note-ok');"
node scripts/mcp_entry_preview.mjs preview --task-title "Freeze the current MCP zero-server boundary" --task-path plans/p3-3-mcp-first-packet-entry-v1.md --validate
```

Expected results:
- `git diff --check` returns clean output for this note
- the Node structure check prints `p3-3-zero-server-boundary-note-ok`
- the helper preview prints `mcp-entry-packet-ok` and returns `outcome.reason = "no-configured-servers"`

---

## 7. Work log

- `2026-03-19 00:58 +08`: chose to freeze the current machine at the zero-server stop line instead of widening into MCP config work.
- `2026-03-19 00:58 +08`: re-ran the live helper preview for a dedicated zero-server-boundary task and confirmed the packet still reports `needs-server-selector` with `no-configured-servers`.
- `2026-03-19 00:59 +08`: wrote this note so future status checks do not confuse missing MCP configuration with missing P3.3 implementation.

## 8. Exact files changed

- `notes/p3-3-mcp-zero-server-boundary-v1.md`

Author: Q xiaohu
Version: v1
